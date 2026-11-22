import React from 'react';
import CalendarHeatmap from '../common/CalendarHeatmap';
import LoadingState from '../common/LoadingState';
import './SessionCalendarHeatmap.css';

/** Sessions per day across the selected range. Clicking a day with sessions shows only that day. */
function SessionCalendarHeatmap({ heatmap = null, isLoading = false, selectedDay = null, onSelectDay }) {
    if (isLoading) return <LoadingState variant="inline" label="Loading heatmap…" />;
    if (!heatmap?.days?.length) return <div className="session-heatmap-empty">No sessions in this range.</div>;
    const duration = heatmap.metric === 'duration';
    const maximum = heatmap.max_value ?? heatmap.max_count;
    return (
        <div className="session-heatmap">
            <div className="session-heatmap-subtitle">
                {duration
                    ? `${Math.round(heatmap.total_value || 0)} min total from ${heatmap.range_start} to ${heatmap.range_end}`
                    : `${heatmap.total_sessions} sessions from ${heatmap.range_start} to ${heatmap.range_end}`}
            </div>
            <CalendarHeatmap
                days={heatmap.days}
                scrollToLatest
                selectedDate={selectedDay}
                highlightedDate={selectedDay}
                getLevel={(day) => {
                    const value = day.value ?? day.count;
                    return value > 0 && maximum > 0 ? Math.min(4, Math.ceil(value / maximum * 4)) : 0;
                }}
                getLabel={(day) => `${day.date}: ${duration ? `${Math.round(day.value || 0)} min across ` : ''}${day.count} session${day.count === 1 ? '' : 's'}`}
                onSelectDay={onSelectDay && ((day) => onSelectDay(day.date === selectedDay || !day.count ? null : day.date))}
            />
        </div>
    );
}

export default SessionCalendarHeatmap;
