import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useActivityProgressTimeline } from '../../hooks/useActivityTags';
import { setProgressHover } from '../../hooks/useProgressHover';
import { useRootProgressSettings } from '../../hooks/useRootProgressSettings';
import { useEffectiveDeltaDisplayMode } from '../../hooks/useEffectiveDeltaDisplayMode';
import { useTimezone } from '../../contexts/TimezoneContext';
import ActivityTimelineList from '../common/ActivityTimeline';
import Button from '../atoms/Button';
import TimelineShell from '../common/TimelineShell';
import ProgressChart from './ProgressChart';
import ProgressCompareControls, { ProgressCompareBar, previewChoice, useCompareOpen } from './ProgressCompareControls';
import styles from './ProgressPanel.module.css';

const HISTORY_LIMIT = 20;

/**
 * True only while the container is scrolled and the element sits wholly above its top edge, so
 * an unscrolled pane never shows the docked bar. The bar takes no layout space, so showing it
 * never moves the content.
 */
function useScrolledPast(rootRef, targetRef, active) {
    const [past, setPast] = useState(false);
    useEffect(() => {
        const root = rootRef.current;
        if (!active || !root) return undefined;
        const update = () => {
            const target = targetRef.current;
            setPast(Boolean(target) && root.scrollTop > 0
                && target.getBoundingClientRect().bottom <= root.getBoundingClientRect().top);
        };
        update();
        root.addEventListener('scroll', update, { passive: true });
        return () => root.removeEventListener('scroll', update);
    }, [rootRef, targetRef, active]);
    return active && past;
}

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
    const preview = instance ? previewChoice(instance) : null;
    const query = useActivityProgressTimeline(rootId, selectedActivityId, {
        instanceId: instance?.id || null,
        preview,
        limit: HISTORY_LIMIT,
    });
    const timeline = query.data?.combined ?? query.data;
    const compareOpen = useCompareOpen(selectedActivityId, instance);
    const bodyRef = useRef(null);
    const compareRef = useRef(null);
    const docked = useScrolledPast(bodyRef, compareRef, Boolean(instance));
    const showComparison = () => {
        compareOpen.setOpen(true);
        compareRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    };

    const progressByInstanceId = useMemo(() => new Map((timeline?.items || []).map((item) => [item.id, item.progress_comparison])), [timeline?.items]);
    const { timezone } = useTimezone();
    const { progressSettings } = useRootProgressSettings(rootId);
    const selectedDef = sessionActivityDefs.find((definition) => definition.id === selectedActivityId);
    const deltaDisplayMode = useEffectiveDeltaDisplayMode(selectedDef, progressSettings);
    const selector = (
        <div className={styles.timelineSelector}>
            <label htmlFor="timeline-activity-select">Select Activity</label>
            <select id="timeline-activity-select" value={selectedActivityId || ''} onChange={(event) => setManualSelectedActivityId(event.target.value || null)}>
                {sessionActivityDefs.length ? sessionActivityDefs.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>) : <option value="">No activities in session</option>}
            </select>
        </div>
    );
    // Hovering (or focusing into) a past session marks its point on the charts.
    useEffect(() => () => setProgressHover(null), []);
    const hoverFromEvent = (event) => {
        setProgressHover(event.target.closest?.('[data-instance-id]')?.getAttribute('data-instance-id') || null);
    };
    const historyHover = {
        onMouseOver: hoverFromEvent,
        onMouseLeave: () => setProgressHover(null),
        onFocus: hoverFromEvent,
        onBlur: () => setProgressHover(null),
    };
    // The newest match is the session this one's ▲/▼ hints compare against.
    const [lastSession, ...earlierSessions] = timeline?.items || [];
    const renderList = (items) => (
        <ActivityTimelineList
            items={items}
            activityDef={selectedDef}
            progressByInstanceId={progressByInstanceId}
            timezone={timezone}
            deltaDisplayMode={deltaDisplayMode}
        />
    );
    const emptyMessage = instance?.comparison_context?.mode === 'all' || !instance
        ? `No previous sessions found for ${selectedDef?.name || 'this activity'}`
        : 'No previous sessions match. Try other tags, All history, or turn off Within.';

    return (
        <TimelineShell className={styles.timelinePanel} bodyClassName={styles.timelineBody} bodyRef={bodyRef} selector={selector}>
            {selectedActivityId && instance ? (
                <>
                    <div className={styles.compareDock}>
                        {docked ? (
                            <div className={styles.compareDockBackdrop}>
                                <ProgressCompareBar instance={instance} timeline={timeline} onExpand={showComparison} />
                            </div>
                        ) : null}
                    </div>
                    <ProgressChart rootId={rootId} activityId={selectedActivityId} instance={instance} choice={preview} />
                    <ProgressCompareControls
                        key={instance.id}
                        rootId={rootId}
                        activityId={selectedActivityId}
                        instance={instance}
                        timeline={timeline}
                        open={compareOpen.open}
                        onToggle={compareOpen.toggle}
                        sectionRef={compareRef}
                    />
                </>
            ) : null}
            <section className={styles.timelineSection}>
                <div className={styles.timelineSectionHeader}>Past sessions</div>
                <div className={`${styles.timelineContent} ${styles.historyList}`} {...historyHover}>
                    {!selectedActivityId ? <div className={styles.timelineEmpty}>Select an activity to view previous sessions</div>
                        : query.isLoading ? <div className={styles.timelineLoading}>Loading timeline...</div>
                            : query.error ? <div className={styles.timelineError}>Error: {query.error.message}</div>
                                : lastSession ? (
                                    <>
                                        <div className={styles.historyLabel} title="This session's progress hints compare with it">
                                            Last session
                                        </div>
                                        {renderList([lastSession])}
                                        {earlierSessions.length ? (
                                            <>
                                                <div className={styles.historyLabel}>Earlier sessions</div>
                                                {renderList(earlierSessions)}
                                            </>
                                        ) : null}
                                    </>
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
