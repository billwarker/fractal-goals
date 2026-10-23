import React, { useMemo, useState } from 'react';

import { useActivityProgressTimeline } from '../../hooks/useActivityTags';
import { useRootProgressSettings } from '../../hooks/useRootProgressSettings';
import { useEffectiveDeltaDisplayMode } from '../../hooks/useEffectiveDeltaDisplayMode';
import { useTimezone } from '../../contexts/TimezoneContext';
import ActivityTimelineList from '../common/ActivityTimeline';
import Button from '../atoms/Button';
import TimelineShell from '../common/TimelineShell';
import ProgressChart from './ProgressChart';
import ProgressCompareControls, { comparisonChoice } from './ProgressCompareControls';
import styles from './ProgressPanel.module.css';

const HISTORY_LIMIT = 20;

function ProgressPanel({ rootId, selectedActivity, sessionActivityDefs, sessionInstances = [] }) {
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

    // Ask for exactly what the panel shows (tags and template/program-day scope), so the list and
    // chart match the selected options even while a tag or comparison change is still being saved.
    const choice = instance ? comparisonChoice(instance) : null;
    const preview = choice && (choice.mode === 'same_tags' ? { ...choice, mode: 'tags' } : choice);
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
        : 'No previous sessions match. Try other tags, All history, or turn off Within.';

    return (
        <TimelineShell className={styles.timelinePanel} bodyClassName={styles.timelineBody} selector={selector}>
            {selectedActivityId && instance ? (
                <>
                    <ProgressChart rootId={rootId} activityId={selectedActivityId} instance={instance} choice={preview} />
                    <ProgressCompareControls key={instance.id} rootId={rootId} activityId={selectedActivityId} instance={instance} timeline={timeline} />
                </>
            ) : null}
            <section className={styles.timelineSection}>
                <div className={styles.timelineSectionHeader}>Past sessions</div>
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

export default ProgressPanel;
