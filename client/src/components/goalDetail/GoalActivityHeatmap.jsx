import React, { useLayoutEffect, useRef, useState } from 'react';
import Button from '../atoms/Button';
import { useTimezone } from '../../contexts/TimezoneContext';
import { resolveGoalLevel, useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useGoalActivityHeatmap } from '../../hooks/useGoalActivityHeatmap';
import CalendarHeatmap from '../common/CalendarHeatmap';
import { heatmapIntensity } from '../common/calendarHeatmapModel';
import GoalTimelineFeed from './GoalTimelineFeed';
import styles from './GoalActivityHeatmap.module.css';
import calendarStyles from '../common/CalendarHeatmap.module.css';

function dayLabel(day) {
    return `${day.date} · ${day.activities} completed activit${day.activities === 1 ? 'y' : 'ies'} · ${day.events} event${day.events === 1 ? '' : 's'}${day.milestones ? ` · ${day.milestones} milestone${day.milestones === 1 ? '' : 's'}` : ''}${day.paused ? ' · Goal paused' : ''}`;
}

function GoalActivityCalendar({ rootId, goalId, goal, timezone, goalColor, snapshotEntries = null, onExplore }) {
    const isSnapshot = Array.isArray(snapshotEntries);
    const calendarBlock = useRef(null);
    const [includeChildren, setIncludeChildren] = useState(true);
    const [selectedDate, setSelectedDate] = useState(null);
    const [previewDay, setPreviewDay] = useState(null);
    const { data, isLoading, isError, refetch } = useGoalActivityHeatmap(rootId, goalId, { includeChildren, timezone, enabled: !isSnapshot });
    useLayoutEffect(() => {
        const block = calendarBlock.current;
        if (!block) return undefined;
        const updateHeight = () => block.parentElement.style.setProperty('--goal-timeline-calendar-height', `${block.offsetHeight}px`);
        updateHeight();
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateHeight);
            return () => window.removeEventListener('resize', updateHeight);
        }
        const observer = new ResizeObserver(updateHeight);
        observer.observe(block);
        return () => observer.disconnect();
    }, [data]);
    const displayedDay = data?.days.find((day) => day.date === (previewDay?.date || selectedDate));
    const level = (day) => heatmapIntensity(day.activities);
    const thresholds = ['0', '1', '2–3', '4–6', '7+'];
    const closeDay = () => {
        setSelectedDate(null);
        // Restore the selected day's focus after its detail panel is dismissed.
        document.getElementById(`goal-activity-${goalId}`)?.querySelector('button[data-selected]')?.focus();
    };

    return (
        <section className={`${styles.container} ${calendarStyles.palette} ${calendarStyles.accentPalette}`} style={{ '--heatmap-accent': goalColor }} id={`goal-activity-${goalId}`} aria-label="Timeline">
            <div className={styles.stickyCalendar} ref={calendarBlock}>
                <div className={styles.heading}>
                    <h3>Timeline</h3>
                    <div className={styles.controls}>
                        <label className={styles.scope}>
                            <input type="checkbox" data-readonly-allow checked={includeChildren} onChange={(event) => { setIncludeChildren(event.target.checked); setSelectedDate(null); setPreviewDay(null); }} />
                            Include children
                        </label>
                    </div>
                </div>
                <div>
                    {!isSnapshot && (isLoading ? <p role="status">Loading timeline calendar...</p> : isError ? (
                        <p role="alert">Timeline calendar could not be loaded. <Button variant="secondary" size="sm" onClick={() => refetch()}>Retry calendar</Button></p>
                    ) : data ? (
                        <>
                            {!data.total_activities && <p className={styles.empty}>No work recorded yet. Timeline events appear as markers.</p>}
                            <CalendarHeatmap days={data.days} accentColor={goalColor} showYears showPreview={false} scrollToLatest getLevel={level} getLabel={dayLabel} selectedDate={selectedDate} onPreviewDayChange={setPreviewDay} onSelectDay={(day) => setSelectedDate(day.date)} />
                            <div className={styles.legendGroup}>
                                <div className={styles.legend} role="group" aria-label="Completed activities per day" title="Completed activities per day">
                                    <span className={styles.legendTitle}>Activities/day</span>
                                    {thresholds.map((label, index) => <span key={label}><i data-level={index} aria-hidden="true" />{label}</span>)}
                                </div>
                                <div className={styles.markerLegend} aria-label="Calendar markers">
                                    <span role="img" aria-label="Dot: other timeline events" title="Dot: other timeline events"><i className={styles.eventMarker} aria-hidden="true" />Events</span>
                                    <span role="img" aria-label="Diamond: target or goal achievement" title="Diamond: target or goal achievement"><i className={styles.milestoneMarker} aria-hidden="true" />Milestone</span>
                                    <span role="img" aria-label="Outline: goal paused on this day" title="Outline: goal paused on this day"><i className={styles.pausedMarker} aria-hidden="true" />Paused</span>
                                </div>
                            </div>
                            <p className={styles.summary} aria-live="polite" aria-atomic="true">{displayedDay ? dayLabel(displayedDay) : <>{data.work_days} days with recorded work · {data.total_activities} completed activities</>}
                            </p>
                        </>
                    ) : null)}
                </div>
            </div>
            <GoalTimelineFeed key={`${includeChildren}:${selectedDate || 'all'}`} rootId={rootId} goalId={goalId} goal={goal} timezone={timezone} metric="events" includeChildren={includeChildren} date={selectedDate} calendarDate={data?.range_end} onClearDate={closeDay} snapshotEntries={snapshotEntries} onExplore={onExplore} />
        </section>
    );
}

export default function GoalActivityHeatmap(props) {
    const { timezone } = useTimezone();
    const { goalLevels, getGoalColor } = useGoalLevels();
    const goalColor = resolveGoalLevel(goalLevels, props.goal)?.color || getGoalColor(props.goal?.attributes?.type || props.goal?.type);
    return <GoalActivityCalendar key={`${props.goalId}:${timezone}`} {...props} timezone={timezone} goalColor={goalColor} />;
}
