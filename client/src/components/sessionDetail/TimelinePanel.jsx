import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
    progressPreviewSignature,
    useActivityProgressTimeline,
    useActivityProgressViewMutations,
} from '../../hooks/useActivityProgressViews';
import { useRootProgressSettings } from '../../hooks/useRootProgressSettings';
import { useEffectiveDeltaDisplayMode } from '../../hooks/useEffectiveDeltaDisplayMode';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import ActivityTimelineList from '../common/ActivityTimeline';
import ConfirmationModal from '../ConfirmationModal';
import Button from '../atoms/Button';
import DisclosureButton from '../atoms/DisclosureButton';
import RemoveButton from '../atoms/RemoveButton';
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

function configuredBuckets(config) {
    return BUCKETS
        .filter(([bucket]) => (config?.[bucket] || []).length > 0)
        .map(([bucket]) => bucket);
}

function ProgressViewControls({ rootId, activityId, timeline, draft, setDraft, dirty, setDirty, isPreviewing = false }) {
    const views = timeline?.views || [];
    const tags = (timeline?.tags || []).filter((tag) => !tag.archived || Object.values(draft).some((ids) => Array.isArray(ids) && ids.includes(tag.id)));
    const activeView = views.find((view) => view.id === timeline?.active_view_id) || null;
    const baselineConfig = normalizeConfig(activeView?.config || EMPTY_CONFIG);
    const baselineBuckets = configuredBuckets(baselineConfig);
    const [expanded, setExpanded] = useState(false);
    const [operatorBuckets, setOperatorBuckets] = useState(() => configuredBuckets(baselineConfig));
    const [showOperatorMenu, setShowOperatorMenu] = useState(false);
    const [saveAsName, setSaveAsName] = useState('');
    const [showSaveAs, setShowSaveAs] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [showRename, setShowRename] = useState(false);
    const [conflict, setConflict] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const operatorButtonRef = useRef(null);
    const operatorMenuRef = useRef(null);
    const { createView, updateView, deleteView, activateView, isPending } = useActivityProgressViewMutations(rootId, activityId);
    const availableBuckets = BUCKETS.filter(([bucket]) => !operatorBuckets.includes(bucket));
    const operatorUiChanged = operatorBuckets.join(',') !== baselineBuckets.join(',');

    const preserveConflict = (error) => {
        const current = error?.response?.status === 409
            ? error?.response?.data?.details?.current
            : null;
        if (!current) return false;
        setConflict(current);
        notify.warning('This progress view changed elsewhere. Your draft has been preserved.');
        return true;
    };

    useEffect(() => {
        if (!showOperatorMenu) return undefined;
        operatorMenuRef.current?.querySelector('button')?.focus();
        const close = (restoreFocus = true) => {
            setShowOperatorMenu(false);
            if (restoreFocus) requestAnimationFrame(() => operatorButtonRef.current?.focus());
        };
        const onPointerDown = (event) => {
            if (!operatorMenuRef.current?.contains(event.target) && !operatorButtonRef.current?.contains(event.target)) {
                close(false);
            }
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
                return;
            }
            if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
            event.preventDefault();
            const items = [...(operatorMenuRef.current?.querySelectorAll('button') || [])];
            const currentIndex = items.indexOf(document.activeElement);
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            items[(currentIndex + direction + items.length) % items.length]?.focus();
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [showOperatorMenu]);

    const handleSelect = async (event) => {
        const viewId = event.target.value || null;
        try {
            await activateView(viewId);
            const view = views.find((item) => item.id === viewId);
            const nextConfig = normalizeConfig(view?.config || EMPTY_CONFIG);
            setDraft(nextConfig);
            setOperatorBuckets(configuredBuckets(nextConfig));
            setDirty(false);
            setExpanded(false);
            setShowOperatorMenu(false);
            setConflict(null);
            notify.success(viewId ? `Activated “${view?.name || 'progress view'}”` : 'Activated All History');
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

    const addOperator = (bucket) => {
        setOperatorBuckets((current) => BUCKETS
            .map(([candidate]) => candidate)
            .filter((candidate) => candidate === bucket || current.includes(candidate)));
        setShowOperatorMenu(false);
        requestAnimationFrame(() => operatorButtonRef.current?.focus());
    };

    const removeOperator = (bucket) => {
        const hadSelections = (draft[bucket] || []).length > 0;
        setDraft((current) => ({ ...current, [bucket]: [] }));
        setOperatorBuckets((current) => current.filter((candidate) => candidate !== bucket));
        setDirty((current) => current || hadSelections);
    };

    const handleSave = async () => {
        if (!activeView) return;
        try {
            await updateView({ viewId: activeView.id, version: activeView.version, config: draft });
            setDirty(false);
            setConflict(null);
            notify.success(`Saved “${activeView.name}”`);
        } catch (error) {
            if (preserveConflict(error)) return;
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
            setConflict(null);
            notify.success(`Created and activated “${name}”`);
        } catch (error) {
            notify.error(`Failed to save progress view: ${formatError(error)}`);
        }
    };

    const handleCancel = () => {
        setDraft(baselineConfig);
        setOperatorBuckets(baselineBuckets);
        setDirty(false);
        setShowSaveAs(false);
        setShowRename(false);
        setShowOperatorMenu(false);
        setConflict(null);
    };

    const handleDelete = async () => {
        if (!activeView) return;
        try {
            await deleteView(activeView.id);
            setDraft(normalizeConfig(EMPTY_CONFIG));
            setOperatorBuckets([]);
            setDirty(false);
            setConflict(null);
            notify.success(`Deleted “${activeView.name}”; All History is now active`);
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
            setConflict(null);
            notify.success(`Renamed progress view to “${renameValue.trim()}”`);
        } catch (error) {
            if (preserveConflict(error)) return;
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
                <DisclosureButton
                    className={styles.progressViewToggle}
                    expanded={expanded}
                    aria-label={expanded ? 'Collapse progress view editor' : 'Expand progress view editor'}
                    onClick={() => setExpanded((current) => !current)}
                />
            </div>
            {expanded ? (
                <div className={styles.progressViewEditor}>
                    <span className={styles.cohortCount}>{timeline?.included_count ?? 0} of {timeline?.total ?? 0} shown</span>
                    {isPreviewing ? <span className={styles.previewStatus} role="status">Updating preview…</span> : null}
                    {conflict ? (
                        <div className={styles.conflictNotice} role="alert">
                            <span>The saved view is now version {conflict.version}. Your local draft is still available.</span>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                    const serverConfig = normalizeConfig(conflict.config || EMPTY_CONFIG);
                                    setDraft(serverConfig);
                                    setOperatorBuckets(configuredBuckets(serverConfig));
                                    setDirty(false);
                                    setConflict(null);
                                }}
                            >
                                Load saved version
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => { setShowRename(false); setShowSaveAs(true); }}>
                                Save draft as…
                            </Button>
                        </div>
                    ) : null}
                    {operatorBuckets.length ? (
                        <div className={styles.logicBuckets}>
                            {BUCKETS.filter(([bucket]) => operatorBuckets.includes(bucket)).map(([bucket, label]) => (
                                <div key={bucket} className={styles.logicBucket} role="group" aria-label={`${label} tags`}>
                                    <div className={styles.logicBucketHeader}>
                                        <span>{label}</span>
                                        <RemoveButton aria-label={`Remove ${label} operator`} onClick={() => removeOperator(bucket)} />
                                    </div>
                                    <div className={styles.tagChoices}>
                                        {tags.length ? tags.map((tag) => (
                                            <label key={tag.id} className={`${styles.tagChoice} ${draft[bucket]?.includes(tag.id) ? styles.tagChoiceSelected : ''}`}>
                                                <input type="checkbox" checked={draft[bucket]?.includes(tag.id) || false} onChange={() => toggleTag(bucket, tag.id)} />
                                                <span style={tag.color ? { '--tag-color': tag.color } : undefined}>{tag.name}{tag.archived ? ' (archived)' : ''}</span>
                                            </label>
                                        )) : <span className={styles.noTags}>Add tags to an activity instance or set to refine progress.</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className={styles.noOperators}>No tag operators. This view includes all history.</span>
                    )}
                    {availableBuckets.length ? (
                        <div className={styles.operatorAdder}>
                            <Button ref={operatorButtonRef} size="sm" variant="secondary" onClick={() => setShowOperatorMenu((current) => !current)} aria-expanded={showOperatorMenu} aria-haspopup="menu">
                                + Add operator
                            </Button>
                            {showOperatorMenu ? (
                                <div ref={operatorMenuRef} className={styles.operatorMenu} role="menu" aria-label="Add progress operator">
                                    {availableBuckets.map(([bucket, label]) => (
                                        <button key={bucket} type="button" role="menuitem" onClick={() => addOperator(bucket)}>{label}</button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <div className={styles.progressViewActions}>
                        <Button size="sm" onClick={handleSave} disabled={!activeView || !dirty || isPending}>Save</Button>
                        <Button size="sm" variant="secondary" onClick={() => { setShowRename(false); setShowSaveAs(true); }} disabled={isPending}>Save as…</Button>
                        <Button size="sm" variant="secondary" onClick={handleCancel} disabled={!dirty && !showSaveAs && !showRename && !operatorUiChanged}>Cancel</Button>
                        {activeView ? <Button size="sm" variant="secondary" onClick={() => { setShowSaveAs(false); setRenameValue(activeView.name); setShowRename(true); }} disabled={isPending}>Rename</Button> : null}
                        {activeView ? <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(true)} disabled={isPending}>Delete</Button> : null}
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
                    <ConfirmationModal
                        isOpen={confirmDelete}
                        onClose={() => setConfirmDelete(false)}
                        onConfirm={handleDelete}
                        title="Delete progress view?"
                        message={`Delete “${activeView?.name || 'this view'}”? All History will become active.`}
                        confirmText="Delete view"
                    />
                </div>
            ) : null}
        </div>
    );
}

function TimelinePanel({ rootId, sessionId, selectedActivity, sessionActivityDefs }) {
    const [manualSelectedActivityId, setManualSelectedActivityId] = useState(null);
    const [draftState, setDraftState] = useState({ key: null, config: normalizeConfig(EMPTY_CONFIG) });
    const [previewDraft, setPreviewDraft] = useState(null);
    const [dirty, setDirty] = useState(false);
    const availableActivityIds = useMemo(() => sessionActivityDefs.map((definition) => definition.id), [sessionActivityDefs]);
    const selectedActivityId = useMemo(() => {
        const focused = selectedActivity?.activity_definition_id;
        if (focused && availableActivityIds.includes(focused)) return focused;
        if (manualSelectedActivityId && availableActivityIds.includes(manualSelectedActivityId)) return manualSelectedActivityId;
        return availableActivityIds[0] || null;
    }, [availableActivityIds, manualSelectedActivityId, selectedActivity]);

    useEffect(() => {
        if (!dirty) return undefined;
        const timeout = window.setTimeout(() => setPreviewDraft(draftState.config), 180);
        return () => window.clearTimeout(timeout);
    }, [dirty, draftState.config]);

    const query = useActivityProgressTimeline(rootId, selectedActivityId, {
        excludeSessionId: sessionId,
        draftConfig: dirty ? previewDraft : null,
        limit: HISTORY_LIMIT,
    });
    const timeline = query.data?.combined ?? query.data;
    const activeView = timeline?.views?.find((view) => view.id === timeline.active_view_id) || null;
    const draftKey = `${selectedActivityId || 'none'}:${activeView?.id || 'all'}:${activeView?.version || 0}`;
    const persistedDraft = normalizeConfig(activeView?.config || EMPTY_CONFIG);
    const draft = dirty || draftState.key === draftKey ? draftState.config : persistedDraft;
    const previewPending = dirty && (
        progressPreviewSignature(previewDraft) !== progressPreviewSignature(draftState.config)
        || query.isFetching
    );
    const setDraft = (updater) => {
        setDraftState((current) => {
            const currentConfig = current.key === draftKey ? current.config : draft;
            return {
                key: draftKey,
                config: typeof updater === 'function' ? updater(currentConfig) : updater,
            };
        });
    };

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
            {selectedActivityId ? <ProgressViewControls key={`${selectedActivityId}:${timeline?.active_view_id || 'all'}`} rootId={rootId} activityId={selectedActivityId} timeline={timeline} draft={draft} setDraft={setDraft} dirty={dirty} setDirty={setDirty} isPreviewing={previewPending} /> : null}
            <section className={styles.timelineSection}>
                <div className={styles.timelineSectionHeader}>Activity Timeline</div>
                <div className={styles.timelineContent}>
                    {!selectedActivityId ? <div className={styles.timelineEmpty}>Select an activity to view previous sessions</div>
                        : query.isLoading ? <div className={styles.timelineLoading}>Loading timeline...</div>
                            : query.error ? <div className={styles.timelineError}>Error: {query.error.message}</div>
                                : timeline?.items?.length ? <ActivityTimelineList items={timeline.items} activityDef={selectedDef} progressByInstanceId={progressByInstanceId} timezone={timezone} deltaDisplayMode={deltaDisplayMode} />
                                    : <div className={styles.timelineEmpty}>No previous sessions found for {selectedDef?.name || 'this activity'}</div>}
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
