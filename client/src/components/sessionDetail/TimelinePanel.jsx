import React, { useMemo, useState } from 'react';

import { useActivityProgressTimeline, useProgressComparisonMutation } from '../../hooks/useActivityTags';
import { useRootProgressSettings } from '../../hooks/useRootProgressSettings';
import { useEffectiveDeltaDisplayMode } from '../../hooks/useEffectiveDeltaDisplayMode';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import ActivityTimelineList from '../common/ActivityTimeline';
import ActivityTagBadges from '../common/ActivityTagBadges';
import Button from '../atoms/Button';
import TimelineShell from '../common/TimelineShell';
import ActivityTagEditor from './ActivityTagEditor';
import styles from './TimelinePanel.module.css';

const HISTORY_LIMIT = 20;
const MODES = [
    ['same_tags', 'Same tags'],
    ['tags', 'Specific tags'],
    ['all', 'All history'],
];

/** What this instance's ▲/▼ hints compare against. Saved on the instance only. */
function CompareControls({ rootId, activityId, instance, timeline }) {
    const context = instance.comparison_context || { mode: 'same_tags', tag_ids: [], tags: [] };
    const { setComparison, isPending } = useProgressComparisonMutation(rootId, activityId);
    // "Specific tags" starts from the instance's own tags, so narrowing or widening is one click.
    const [draftTagIds, setDraftTagIds] = useState(null);
    const chosenTagIds = context.mode === 'tags' ? context.tag_ids : (draftTagIds ?? (instance.tags || []).map((tag) => tag.id));

    const save = async (mode, tagIds = []) => {
        try {
            await setComparison({
                instanceId: instance.id,
                mode,
                tagIds,
                tags: [],
                version: context.version,
            });
        } catch (error) {
            notify.error(`Failed to change comparison: ${formatError(error)}`);
        }
    };

    const total = timeline?.total ?? 0;
    const totalAll = timeline?.total_all ?? 0;
    return (
        <div className={styles.compareControls} aria-label="Progress comparison">
            <div className={styles.compareHeader}>
                <strong id="compare-with-label">Compare with</strong>
                {timeline ? (
                    <span className={styles.cohortCount}>
                        {context.mode === 'all' ? `${totalAll} past session${totalAll === 1 ? '' : 's'}` : `${total} of ${totalAll} past sessions match`}
                    </span>
                ) : null}
            </div>
            <fieldset className={styles.compareModes} aria-labelledby="compare-with-label" disabled={isPending}>
                {MODES.map(([mode, label]) => (
                    <label key={mode} className={`${styles.compareMode} ${context.mode === mode ? styles.compareModeSelected : ''}`}>
                        <input
                            type="radio"
                            name={`compare-mode-${instance.id}`}
                            checked={context.mode === mode}
                            onChange={() => void save(mode, mode === 'tags' ? chosenTagIds : [])}
                        />
                        {label}
                    </label>
                ))}
            </fieldset>
            <div className={styles.compareDetail}>
                {context.mode === 'same_tags' ? (
                    (instance.tags || []).length
                        ? <><span>Past sessions tagged</span><ActivityTagBadges tags={instance.tags} /></>
                        : <span>Past sessions with no tags on this activity</span>
                ) : null}
                {context.mode === 'tags' ? (
                    <ActivityTagEditor
                        rootId={rootId}
                        activityId={activityId}
                        selectedTagIds={chosenTagIds}
                        onChangeTags={(tagIds) => {
                            setDraftTagIds(tagIds);
                            void save('tags', tagIds);
                        }}
                        triggerFirst
                    />
                ) : null}
                {context.mode === 'all' ? <span>Every past session, whatever its tags</span> : null}
                {context.mode !== 'same_tags' ? (
                    <button type="button" className={styles.resetComparison} onClick={() => void save('same_tags')} disabled={isPending}>
                        Reset to same tags
                    </button>
                ) : null}
            </div>
        </div>
    );
}

function TimelinePanel({ rootId, selectedActivity, sessionActivityDefs, sessionInstances = [] }) {
    const [manualSelectedActivityId, setManualSelectedActivityId] = useState(null);
    const availableActivityIds = useMemo(() => sessionActivityDefs.map((definition) => definition.id), [sessionActivityDefs]);
    const selectedActivityId = useMemo(() => {
        const focused = selectedActivity?.activity_definition_id;
        if (focused && availableActivityIds.includes(focused)) return focused;
        if (manualSelectedActivityId && availableActivityIds.includes(manualSelectedActivityId)) return manualSelectedActivityId;
        return availableActivityIds[0] || null;
    }, [availableActivityIds, manualSelectedActivityId, selectedActivity]);
    // The live cache copy, so a saved comparison or tag change shows immediately.
    const instance = useMemo(() => {
        const candidates = (sessionInstances || []).filter((row) => row.activity_definition_id === selectedActivityId);
        return candidates.find((row) => row.id === selectedActivity?.id) || candidates[0] || null;
    }, [selectedActivity?.id, selectedActivityId, sessionInstances]);

    // Ask for exactly what the panel shows (the instance's tags, chosen tags, or all history), so the
    // list matches the selected option even while a tag or comparison change is still being saved.
    const shownContext = instance?.comparison_context;
    const preview = !instance ? null
        : shownContext?.mode === 'all' ? { mode: 'all', tagIds: [] }
            : { mode: 'tags', tagIds: shownContext?.mode === 'tags' ? shownContext.tag_ids || [] : (instance.tags || []).map((tag) => tag.id) };
    const query = useActivityProgressTimeline(rootId, selectedActivityId, {
        instanceId: instance?.id || null,
        preview,
        limit: HISTORY_LIMIT,
    });
    const timeline = query.data?.combined ?? query.data;

    const progressByInstanceId = useMemo(() => new Map((timeline?.items || []).map((item) => [item.id, item.progress_comparison])), [timeline?.items]);
    // Earlier sets the current instance's sets are compared with, keyed by instance id.
    const pairedSetIndexes = useMemo(() => {
        const paired = new Map();
        (instance?.progress_comparison?.metric_comparisons || []).forEach((comparison) => {
            (comparison.set_comparisons || []).forEach((entry) => {
                if (!entry.previous_instance_id || entry.previous_set_index == null) return;
                if (!paired.has(entry.previous_instance_id)) paired.set(entry.previous_instance_id, new Set());
                paired.get(entry.previous_instance_id).add(entry.previous_set_index);
            });
        });
        return paired;
    }, [instance?.progress_comparison]);
    const { timezone } = useTimezone();
    const { progressSettings } = useRootProgressSettings(rootId);
    const selectedDef = sessionActivityDefs.find((definition) => definition.id === selectedActivityId);
    const deltaDisplayMode = useEffectiveDeltaDisplayMode(selectedDef, progressSettings);
    const selector = (
        <div className={styles.timelineSelector}>
            <label htmlFor="timeline-activity-select">Select Activity:</label>
            <select id="timeline-activity-select" value={selectedActivityId || ''} onChange={(event) => setManualSelectedActivityId(event.target.value || null)}>
                {sessionActivityDefs.length ? sessionActivityDefs.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>) : <option value="">No activities in session</option>}
            </select>
        </div>
    );
    const emptyMessage = instance?.comparison_context?.mode === 'all' || !instance
        ? `No previous sessions found for ${selectedDef?.name || 'this activity'}`
        : `No previous sessions match. Try Specific tags or All history.`;

    return (
        <TimelineShell className={styles.timelinePanel} bodyClassName={styles.timelineBody} selector={selector}>
            {selectedActivityId && instance ? (
                <CompareControls key={instance.id} rootId={rootId} activityId={selectedActivityId} instance={instance} timeline={timeline} />
            ) : null}
            <section className={styles.timelineSection}>
                <div className={styles.timelineSectionHeader}>Activity Timeline</div>
                <div className={styles.timelineContent}>
                    {!selectedActivityId ? <div className={styles.timelineEmpty}>Select an activity to view previous sessions</div>
                        : query.isLoading ? <div className={styles.timelineLoading}>Loading timeline...</div>
                            : query.error ? <div className={styles.timelineError}>Error: {query.error.message}</div>
                                : timeline?.items?.length ? (
                                    <ActivityTimelineList
                                        items={timeline.items}
                                        activityDef={selectedDef}
                                        progressByInstanceId={progressByInstanceId}
                                        pairedSetIndexes={pairedSetIndexes}
                                        timezone={timezone}
                                        deltaDisplayMode={deltaDisplayMode}
                                    />
                                )
                                    : <div className={styles.timelineEmpty}>{emptyMessage}</div>}
                    {query.hasNextPage ? (
                        <Button
                            size="sm"
                            variant="secondary"
                            className={styles.loadMoreHistory}
                            onClick={() => query.fetchNextPage()}
                            isLoading={query.isFetchingNextPage}
                        >
                            Load older history
                        </Button>
                    ) : null}
                </div>
            </section>
        </TimelineShell>
    );
}

export default TimelinePanel;
