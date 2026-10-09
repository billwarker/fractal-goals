import React from 'react';
import CalendarHeatmap from '../common/CalendarHeatmap';
import './SessionCalendarHeatmap.css';

function SessionCalendarHeatmap({ heatmap = null, isLoading = false }) {
    if (isLoading) return <div className="session-heatmap-empty">Loading heatmap...</div>;
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
                getLevel={(day) => {
                    const value = day.value ?? day.count;
                    return value > 0 && maximum > 0 ? Math.min(4, Math.ceil(value / maximum * 4)) : 0;
                }}
                getLabel={(day) => `${day.date}: ${duration ? `${Math.round(day.value || 0)} min across ` : ''}${day.count} session${day.count === 1 ? '' : 's'}`}
            />
        </div>
    );
}

export default SessionCalendarHeatmap;
