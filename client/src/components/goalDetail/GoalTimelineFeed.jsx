import React, { useEffect, useRef, useState } from 'react';
import Button from '../atoms/Button';
import { useGoalTimelinePages } from '../../hooks/useGoalTimelinePages';
import { GoalTimelineEntries } from './GoalTimelineEntries';
import styles from './GoalTimelineEntries.module.css';
import sectionStyles from './GoalActivityHeatmap.module.css';

function matches(entry, metric, includeChildren, date, timezone) {
    if (!includeChildren && entry.relationship === 'descendant') return false;
    if (metric !== 'events' && entry.event_type !== 'activity.completed') return false;
    if (metric === 'duration' && !(entry.payload?.duration_seconds > 0)) return false;
    return !date || new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(entry.timestamp)) === date;
}

export default function GoalTimelineFeed({ rootId, goalId, goal, timezone, metric, includeChildren, date, calendarDate, onClearDate, snapshotEntries = null, onExplore }) {
    const isSnapshot = Array.isArray(snapshotEntries);
    const query = useGoalTimelinePages(rootId, goalId, { includeChildren, timezone, metric, date, calendarDate, enabled: !isSnapshot });
    const [visibleCount, setVisibleCount] = useState(20);
    const heading = useRef(null);
    useEffect(() => {
        if (date) {
            heading.current?.focus({ preventScroll: true });
            heading.current?.scrollIntoView?.({ block: 'nearest' });
        }
    }, [date]);
    const snapshot = isSnapshot ? snapshotEntries.filter((entry) => matches(entry, metric, includeChildren, date, timezone))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id.localeCompare(a.id)) : [];
    const pages = query.data?.pages || [];
    const entries = isSnapshot ? snapshot.slice(0, visibleCount) : pages.flatMap((page) => page.entries);
    const total = isSnapshot ? snapshot.length : pages[0]?.pagination.total;
    const hasMore = isSnapshot ? visibleCount < total : query.hasNextPage;
    return (
        <section className={sectionStyles.dayDetail} aria-label={date ? `Evidence for ${date}` : 'Timeline entries'} onWheel={onExplore} onTouchMove={onExplore} onFocusCapture={onExplore}>
            <div className={sectionStyles.heading}>
                <h4 ref={heading} tabIndex={-1}>{date || 'Recent events'}</h4>
                {date && <Button variant="secondary" size="sm" data-readonly-allow onClick={onClearDate}>Close day</Button>}
            </div>
            {isSnapshot && <p className={sectionStyles.help}>Published timeline snapshot; recent evidence may be incomplete.</p>}
            {!isSnapshot && query.isLoading ? <p role="status">Loading timeline...</p> : null}
            {!isSnapshot && query.isError && !pages.length && <p role="alert">Timeline could not be loaded. <Button variant="secondary" size="sm" onClick={() => query.refetch()}>Retry</Button></p>}
            {!isSnapshot && query.isFetchNextPageError && <p role="alert">More entries could not be loaded. The entries above are still available.</p>}
            <div className={styles.timeline}>
                <GoalTimelineEntries entries={entries} rootId={rootId} timezone={timezone} currentGoal={goal} />
            </div>
            {(isSnapshot || (!query.isLoading && !query.isError)) && !entries.length && <p>No timeline events match these filters{date ? ' on this day' : ''}.</p>}
            {total != null && <p className={sectionStyles.help} role="status">Showing {entries.length} of {total} entries</p>}
            {hasMore && <Button variant="secondary" size="sm" data-readonly-allow disabled={query.isFetchingNextPage} onClick={() => isSnapshot ? setVisibleCount((count) => count + 20) : query.fetchNextPage()}>
                {query.isFetchingNextPage ? 'Loading more...' : query.isFetchNextPageError ? 'Retry loading more' : 'Load more'}
            </Button>}
        </section>
    );
}
