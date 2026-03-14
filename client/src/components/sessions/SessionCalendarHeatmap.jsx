import React, { useEffect, useMemo, useRef, useState } from 'react';
import './SessionCalendarHeatmap.css';

const CELL_SIZE = 16;
const CELL_GAP = 6;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toUtcDate(dateString) {
    return new Date(`${dateString}T00:00:00Z`);
}

function formatMonthLabel(dateValue) {
    return dateValue.toLocaleDateString('en-US', {
        month: 'short',
        timeZone: 'UTC',
    });
}

function buildHeatmapColumns(days = []) {
    if (!Array.isArray(days) || days.length === 0) {
        return {
            columns: [],
            monthLabels: [],
        };
    }

    const chronologicalDays = [...days].reverse();
    const dayByDate = new Map(
        chronologicalDays.map((day) => [day.date, day])
    );
    const countByDate = new Map(
        chronologicalDays.map((day) => [day.date, day.count])
    );

    const firstDate = toUtcDate(chronologicalDays[0].date);
    const lastDate = toUtcDate(chronologicalDays[chronologicalDays.length - 1].date);

    const startDate = new Date(firstDate);
    startDate.setUTCDate(startDate.getUTCDate() - startDate.getUTCDay());

    const endDate = new Date(lastDate);
    endDate.setUTCDate(endDate.getUTCDate() + (6 - endDate.getUTCDay()));

    const allDates = [];
    for (let current = new Date(startDate); current <= endDate; current.setUTCDate(current.getUTCDate() + 1)) {
        const dateKey = current.toISOString().slice(0, 10);
        const matchingDay = dayByDate.get(dateKey);
        allDates.push({
            date: dateKey,
            count: countByDate.get(dateKey) || 0,
            value: matchingDay?.value ?? matchingDay?.count ?? 0,
            dayOfWeek: current.getUTCDay(),
            inRange: countByDate.has(dateKey),
            dateValue: new Date(current),
        });
    }

    const columns = [];
    for (let index = 0; index < allDates.length; index += 7) {
        columns.push(allDates.slice(index, index + 7));
    }

    const monthLabels = [];
    let previousMonth = null;
    columns.forEach((column, columnIndex) => {
        const firstInRangeDay = column.find((day) => day.inRange);
        if (!firstInRangeDay) return;
        const monthKey = `${firstInRangeDay.dateValue.getUTCFullYear()}-${firstInRangeDay.dateValue.getUTCMonth()}`;
        if (monthKey === previousMonth) return;
        previousMonth = monthKey;
        monthLabels.push({
            columnIndex,
            label: formatMonthLabel(firstInRangeDay.dateValue),
        });
    });

    return {
        columns,
        monthLabels,
    };
}

function formatMetricValue(metric, value) {
    if (metric === 'duration') {
        return `${Math.round(value)} min`;
    }
    return `${value}`;
}

function formatTooltipText(metric, day) {
    if (metric === 'duration') {
        return `${day.date}: ${Math.round(day.value || 0)} min across ${day.count} session${day.count === 1 ? '' : 's'}`;
    }
    return `${day.date}: ${day.count} session${day.count === 1 ? '' : 's'}`;
}

function getIntensityClass(value, maxValue) {
    if (!value || maxValue <= 0) return 'session-heatmap-cell-0';
    const ratio = value / maxValue;
    if (ratio <= 0.25) return 'session-heatmap-cell-1';
    if (ratio <= 0.5) return 'session-heatmap-cell-2';
    if (ratio <= 0.75) return 'session-heatmap-cell-3';
    return 'session-heatmap-cell-4';
}

function SessionCalendarHeatmap({
    heatmap = null,
    isLoading = false,
}) {
    const scrollRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);
    const { columns, monthLabels } = useMemo(
        () => buildHeatmapColumns(heatmap?.days || []),
        [heatmap]
    );
    const gridWidth = useMemo(() => {
        if (!columns.length) return 0;
        return (columns.length * CELL_SIZE) + ((columns.length - 1) * CELL_GAP);
    }, [columns.length]);

    useEffect(() => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }, [columns.length]);

    useEffect(() => {
        setTooltip(null);
    }, [heatmap?.metric, heatmap?.range_end, heatmap?.range_start]);

    const updateTooltipPosition = (event, text) => {
        const tooltipWidth = 240;
        const tooltipHeight = 44;
        const nextX = Math.min(event.clientX + 12, window.innerWidth - tooltipWidth - 12);
        const nextY = Math.max(12, event.clientY - tooltipHeight - 12);

        setTooltip({
            text,
            x: nextX,
            y: nextY,
        });
    };

    const hideTooltip = () => {
        setTooltip(null);
    };

    if (isLoading) {
        return <div className="session-heatmap-empty">Loading heatmap...</div>;
    }

    if (!heatmap || !Array.isArray(heatmap.days) || heatmap.days.length === 0) {
        return <div className="session-heatmap-empty">No sessions in this range.</div>;
    }

    return (
        <div className="session-heatmap">
            <div className="session-heatmap-subtitle">
                {heatmap.metric === 'duration'
                    ? `${Math.round(heatmap.total_value || 0)} min total from ${heatmap.range_start} to ${heatmap.range_end}`
                    : `${heatmap.total_sessions} sessions from ${heatmap.range_start} to ${heatmap.range_end}`}
            </div>

            <div className="session-heatmap-shell">
                <div className="session-heatmap-day-axis">
                    {DAY_LABELS.map((label) => (
                        <div key={label} className="session-heatmap-day-label">
                            {label}
                        </div>
                    ))}
                </div>

                <div
                    className="session-heatmap-scroll"
                    ref={scrollRef}
                    onScroll={hideTooltip}
                >
                    <div
                        className="session-heatmap-month-row"
                        style={{ width: `${gridWidth}px` }}
                    >
                        {monthLabels.map((month) => (
                            <div
                                key={`${month.label}-${month.columnIndex}`}
                                className="session-heatmap-month-label"
                                style={{
                                    left: `${month.columnIndex * (CELL_SIZE + CELL_GAP)}px`,
                                }}
                            >
                                {month.label}
                            </div>
                        ))}
                    </div>

                    <div
                        className="session-heatmap-grid"
                        style={{ gridTemplateColumns: `repeat(${columns.length}, ${CELL_SIZE}px)` }}
                    >
                        {columns.map((column, columnIndex) => (
                            <div className="session-heatmap-column" key={`column-${columnIndex}`}>
                                {column.map((day) => (
                                    <div
                                        key={day.date}
                                        className={[
                                            'session-heatmap-cell',
                                            getIntensityClass(day.value ?? day.count, heatmap.max_value ?? heatmap.max_count),
                                            day.inRange ? '' : 'session-heatmap-cell-outside',
                                        ].filter(Boolean).join(' ')}
                                        onMouseEnter={(event) => {
                                            if (!day.inRange) return;
                                            updateTooltipPosition(event, formatTooltipText(heatmap.metric, day));
                                        }}
                                        onMouseMove={(event) => {
                                            if (!day.inRange) return;
                                            updateTooltipPosition(event, formatTooltipText(heatmap.metric, day));
                                        }}
                                        onMouseLeave={hideTooltip}
                                        aria-label={`${day.date}: ${formatMetricValue(heatmap.metric, day.value ?? day.count)}`}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {tooltip && (
                <div
                    className="session-heatmap-tooltip"
                    style={{
                        left: `${tooltip.x}px`,
                        top: `${tooltip.y}px`,
                    }}
                >
                    {tooltip.text}
                </div>
            )}
        </div>
    );
}

export default SessionCalendarHeatmap;
