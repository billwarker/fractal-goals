import React, { useEffect, useMemo, useState } from 'react';

import { useActivityProgressTimeline, useActivityProgressViewMutations } from '../../hooks/useActivityProgressViews';
import { useRootProgressSettings } from '../../hooks/useRootProgressSettings';
import { useEffectiveDeltaDisplayMode } from '../../hooks/useEffectiveDeltaDisplayMode';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import ActivityTimelineList from '../common/ActivityTimeline';
import Button from '../atoms/Button';
import TimelineShell from '../common/TimelineShell';
import styles from './TimelinePanel.module.css';

const HISTORY_LIMIT = 20;
const EMPTY_CONFIG = { schema_version: 1, all_tag_ids: [], any_tag_ids: [], none_tag_ids: [] };
const BUCKETS = [
    ['all_tag_ids', 'All of'],
    ['any_tag_ids', 'Any of'],
    ['none_tag_ids', 'None of'],
];

function normalizeConfig(config) {
    return {
        schema_version: 1,
        all_tag_ids: [...(config?.all_tag_ids || [])],
        any_tag_ids: [...(config?.any_tag_ids || [])],
        none_tag_ids: [...(config?.none_tag_ids || [])],
    };
}

function ProgressViewControls({ rootId, activityId, timeline, draft, setDraft, dirty, setDirty }) {
    const [saveAsName, setSaveAsName] = useState('');
    const [showSaveAs, setShowSaveAs] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [showRename, setShowRename] = useState(false);
    const views = timeline?.views || [];
    const tags = (timeline?.tags || []).filter((tag) => !tag.archived || Object.values(draft).some((ids) => Array.isArray(ids) && ids.includes(tag.id)));
    const activeView = views.find((view) => view.id === timeline?.active_view_id) || null;
    const { createView, updateView, deleteView, activateView, isPending } = useActivityProgressViewMutations(rootId, activityId);

    const handleSelect = async (event) => {
        const viewId = event.target.value || null;
        try {
            await activateView(viewId);
            const view = views.find((item) => item.id === viewId);
            setDraft(normalizeConfig(view?.config || EMPTY_CONFIG));
            setDirty(false);
        } catch (error) {
            notify.error(`Failed to activate progress view: ${formatError(error)}`);
        }
    };

    const toggleTag = (bucket, tagId) => {
        setDraft((current) => {
            const selected = current[bucket] || [];
            return { ...current, [bucket]: selected.includes(tagId) ? selected.filter((id) => id !== tagId) : [...selected, tagId] };
        });
        setDirty(true);
    };

    const handleSave = async () => {
        if (!activeView) return;
        try {
            await updateView({ viewId: activeView.id, version: activeView.version, config: draft });
            setDirty(false);
        } catch (error) {
            notify.error(`Failed to save progress view: ${formatError(error)}`);
        }
    };

    const handleSaveAs = async () => {
        const name = saveAsName.trim();
        if (!name) return;
        try {
            await createView({ name, config: draft, activate: true });
            setSaveAsName('');
            setShowSaveAs(false);
            setDirty(false);
        } catch (error) {
            notify.error(`Failed to save progress view: ${formatError(error)}`);
        }
    };

    const handleCancel = () => {
        setDraft(normalizeConfig(activeView?.config || EMPTY_CONFIG));
        setDirty(false);
        setShowSaveAs(false);
        setShowRename(false);
    };

    const handleDelete = async () => {
        if (!activeView) return;
        if (!window.confirm(`Delete “${activeView.name}”? All History will become active.`)) return;
        try {
            await deleteView(activeView.id);
            setDraft(normalizeConfig(EMPTY_CONFIG));
            setDirty(false);
        } catch (error) {
            notify.error(`Failed to delete progress view: ${formatError(error)}`);
        }
    };

    const handleRename = async () => {
        if (!activeView || !renameValue.trim()) return;
        try {
            await updateView({ viewId: activeView.id, version: activeView.version, name: renameValue.trim() });
            setShowRename(false);
            setRenameValue('');
        } catch (error) {
            notify.error(`Failed to rename progress view: ${formatError(error)}`);
        }
    };

    return (
        <div className={styles.progressViewControls} aria-label="Progress view controls">
            <div className={styles.progressViewToolbar}>
                <label htmlFor="progress-view-select">Progress view</label>
                <select id="progress-view-select" value={timeline?.active_view_id || ''} onChange={handleSelect} disabled={isPending}>
                    <option value="">All History</option>
                    {views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
                </select>
                <span className={styles.cohortCount}>{timeline?.included_count ?? 0} of {timeline?.total ?? 0} shown</span>
            </div>
            <div className={styles.logicBuckets}>
                {BUCKETS.map(([bucket, label]) => (
                    <fieldset key={bucket} className={styles.logicBucket}>
                        <legend>{label}</legend>
                        <div className={styles.tagChoices}>
                            {tags.length ? tags.map((tag) => (
                                <label key={tag.id} className={`${styles.tagChoice} ${draft[bucket]?.includes(tag.id) ? styles.tagChoiceSelected : ''}`}>
                                    <input type="checkbox" checked={draft[bucket]?.includes(tag.id) || false} onChange={() => toggleTag(bucket, tag.id)} />
                                    <span style={tag.color ? { '--tag-color': tag.color } : undefined}>{tag.name}{tag.archived ? ' (archived)' : ''}</span>
                                </label>
                            )) : <span className={styles.noTags}>Add tags to an activity instance or set to refine progress.</span>}
                        </div>
                    </fieldset>
                ))}
            </div>
            <div className={styles.progressViewActions}>
                <Button size="sm" onClick={handleSave} disabled={!activeView || !dirty || isPending}>Save</Button>
                <Button size="sm" variant="secondary" onClick={() => setShowSaveAs(true)} disabled={isPending}>Save as…</Button>
                <Button size="sm" variant="secondary" onClick={handleCancel} disabled={!dirty && !showSaveAs}>Cancel</Button>
                {activeView ? <Button size="sm" variant="secondary" onClick={() => { setRenameValue(activeView.name); setShowRename(true); }} disabled={isPending}>Rename</Button> : null}
                {activeView ? <Button size="sm" variant="secondary" onClick={handleDelete} disabled={isPending}>Delete</Button> : null}
                {showSaveAs ? (
                    <span className={styles.saveAsField}>
                        <input aria-label="Progress view name" value={saveAsName} onChange={(event) => setSaveAsName(event.target.value)} placeholder="View name" autoFocus />
                        <Button size="sm" onClick={handleSaveAs} disabled={!saveAsName.trim() || isPending}>Create</Button>
                    </span>
                ) : null}
                {showRename ? (
                    <span className={styles.saveAsField}>
                        <input aria-label="Renamed progress view" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus />
                        <Button size="sm" onClick={handleRename} disabled={!renameValue.trim() || isPending}>Rename</Button>
                    </span>
                ) : null}
            </div>
        </div>
    );
}

function TimelinePanel({ rootId, sessionId, selectedActivity, sessionActivityDefs }) {
    const [manualSelectedActivityId, setManualSelectedActivityId] = useState(null);
    const [draft, setDraft] = useState(normalizeConfig(EMPTY_CONFIG));
    const [dirty, setDirty] = useState(false);
    const availableActivityIds = useMemo(() => sessionActivityDefs.map((definition) => definition.id), [sessionActivityDefs]);
    const selectedActivityId = useMemo(() => {
        const focused = selectedActivity?.activity_definition_id;
        if (focused && availableActivityIds.includes(focused)) return focused;
        if (manualSelectedActivityId && availableActivityIds.includes(manualSelectedActivityId)) return manualSelectedActivityId;
        return availableActivityIds[0] || null;
    }, [availableActivityIds, manualSelectedActivityId, selectedActivity]);

    const query = useActivityProgressTimeline(rootId, selectedActivityId, {
        excludeSessionId: sessionId,
        draftConfig: dirty ? draft : null,
        limit: HISTORY_LIMIT,
    });
    const timeline = query.data;
    useEffect(() => {
        if (dirty || !timeline) return;
        const active = timeline.views?.find((view) => view.id === timeline.active_view_id);
        setDraft(normalizeConfig(active?.config || EMPTY_CONFIG));
    }, [dirty, timeline]);

    const progressByInstanceId = useMemo(() => new Map((timeline?.items || []).map((item) => [item.id, item.progress_comparison])), [timeline?.items]);
    const { timezone } = useTimezone();
    const { progressSettings } = useRootProgressSettings(rootId);
    const selectedDef = sessionActivityDefs.find((definition) => definition.id === selectedActivityId);
    const deltaDisplayMode = useEffectiveDeltaDisplayMode(selectedDef, progressSettings);
    const selector = (
        <div className={styles.timelineSelector}>
            <label htmlFor="timeline-activity-select">Select Activity:</label>
            <select id="timeline-activity-select" value={selectedActivityId || ''} onChange={(event) => { setManualSelectedActivityId(event.target.value || null); setDirty(false); }}>
                {sessionActivityDefs.length ? sessionActivityDefs.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>) : <option value="">No activities in session</option>}
            </select>
        </div>
    );

    return (
        <TimelineShell className={styles.timelinePanel} bodyClassName={styles.timelineBody} selector={selector}>
            {selectedActivityId ? <ProgressViewControls rootId={rootId} activityId={selectedActivityId} timeline={timeline} draft={draft} setDraft={setDraft} dirty={dirty} setDirty={setDirty} /> : null}
            <section className={styles.timelineSection}>
                <div className={styles.timelineSectionHeader}>Activity Timeline</div>
                <div className={styles.timelineContent}>
                    {!selectedActivityId ? <div className={styles.timelineEmpty}>Select an activity to view previous sessions</div>
                        : query.isLoading ? <div className={styles.timelineLoading}>Loading timeline...</div>
                            : query.error ? <div className={styles.timelineError}>Error: {query.error.message}</div>
                                : timeline?.items?.length ? <ActivityTimelineList items={timeline.items} activityDef={selectedDef} progressByInstanceId={progressByInstanceId} timezone={timezone} deltaDisplayMode={deltaDisplayMode} />
                                    : <div className={styles.timelineEmpty}>No previous sessions found for {selectedDef?.name || 'this activity'}</div>}
                </div>
            </section>
        </TimelineShell>
    );
}

export default TimelinePanel;
