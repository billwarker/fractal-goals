import React from 'react';

import { useNotesHeatmap } from '../../../hooks/useNotesPageQuery';
import CalendarHeatmap from '../../common/CalendarHeatmap';
import styles from './NotesFilters.module.css';

/** Notes written per day under the current filters. Clicking a day shows only that day. */
export default function NotesHeatmap({ rootId, apiFilters, selectedDay, onSelectDay }) {
    const { data, isLoading, isError } = useNotesHeatmap(rootId, apiFilters);
    if (isLoading) return <p className={styles.heatmapSummary} role="status">Loading heatmap…</p>;
    if (isError || !data) return <p className={styles.heatmapSummary}>The heatmap couldn’t load.</p>;
    const maximum = data.max_count || 0;
    return (
        <>
            <p className={styles.heatmapSummary}>
                {data.total ? `${data.total} note${data.total === 1 ? '' : 's'} since ${data.range_start}` : 'No matching notes yet.'}
            </p>
            {data.total > 0 && (
                <CalendarHeatmap
                    days={data.days}
                    scrollToLatest
                    showPreview={false}
                    selectedDate={selectedDay}
                    highlightedDate={selectedDay}
                    getLevel={(day) => (day.count > 0 && maximum > 0 ? Math.min(4, Math.ceil((day.count / maximum) * 4)) : 0)}
                    getLabel={(day) => `${day.date}: ${day.count} note${day.count === 1 ? '' : 's'}`}
                    onSelectDay={(day) => onSelectDay(day.date === selectedDay || !day.count ? null : day.date)}
                />
            )}
        </>
    );
}
