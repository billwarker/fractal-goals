import React, { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../atoms/Button';
import { buildHeatmapCalendar } from './calendarHeatmapModel';
import styles from './CalendarHeatmap.module.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarHeatmap({ days = [], accentColor, showYears = false, showPreview = true, compactTouchTargets = false, getLevel, getLabel, onSelectDay, onPreviewDayChange, selectedDate, scrollToLatest }) {
    const { columns, months, years } = useMemo(() => buildHeatmapCalendar(days), [days]);
    const ordered = useMemo(() => columns.flat().filter((day) => day.inRange), [columns]);
    const scrollRef = useRef(null);
    const buttons = useRef(new Map());
    const [focusedDate, setFocusedDate] = useState(null);
    const [hoveredDay, setHoveredDay] = useState(null);
    const [activeFocusDay, setActiveFocusDay] = useState(null);
    const preview = hoveredDay || activeFocusDay;

    useEffect(() => {
        onPreviewDayChange?.(preview);
    }, [preview, onPreviewDayChange]);
    const tabDate = focusedDate && ordered.some((day) => day.date === focusedDate) ? focusedDate : ordered.at(-1)?.date;

    useEffect(() => {
        if (scrollToLatest && scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }, [columns.length, scrollToLatest]);

    const navigate = (event, date) => {
        const index = ordered.findIndex((day) => day.date === date);
        const offsets = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
        let next;
        if (event.key in offsets) next = Math.max(0, Math.min(ordered.length - 1, index + offsets[event.key]));
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = ordered.length - 1;
        if (next != null) {
            event.preventDefault();
            buttons.current.get(ordered[next].date)?.focus();
        }
    };

    return (
        <section className={`${styles.container} ${styles.palette} ${compactTouchTargets ? styles.compactTouch : ''} ${accentColor ? styles.accentPalette : ''}`} style={accentColor ? { '--heatmap-accent': accentColor } : undefined} aria-label="Activity calendar">
            <div className={styles.shell} style={{ '--heatmap-heading-height': showYears ? '44px' : '24px' }}>
                <div className={styles.axis} aria-hidden="true">
                    {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
                </div>
                <div className={styles.scroll} ref={scrollRef}>
                    {showYears && <div className={styles.years} style={{ '--columns': columns.length }} aria-hidden="true">
                        {years.map((year) => <span key={year.column} style={{ gridColumn: year.column + 1 }}>{year.label}</span>)}
                    </div>}
                    <div className={styles.months} style={{ '--columns': columns.length }} aria-hidden="true">
                        {months.map((month) => <span key={month.column} style={{ gridColumn: month.column + 1 }}>{month.label}</span>)}
                    </div>
                    <div className={styles.grid}>
                        {columns.map((column) => (
                            <div className={styles.column} key={column[0].date}>
                                {column.map((day) => day.inRange ? (
                                    <Button
                                        key={day.date}
                                        ref={(node) => { if (node) buttons.current.set(day.date, node); else buttons.current.delete(day.date); }}
                                        unstyled
                                        className={`${styles.cell} ${day.paused ? styles.paused : ''}`}
                                        data-level={getLevel(day)}
                                        data-selected={selectedDate === day.date || undefined}
                                        aria-label={getLabel(day)}
                                        aria-pressed={onSelectDay ? selectedDate === day.date : undefined}
                                        title={getLabel(day)}
                                        tabIndex={day.date === tabDate ? 0 : -1}
                                        onKeyDown={(event) => navigate(event, day.date)}
                                        onFocus={() => { setFocusedDate(day.date); setActiveFocusDay(day); }}
                                        onBlur={() => setActiveFocusDay(null)}
                                        onPointerEnter={(event) => { if (event.pointerType !== 'touch') setHoveredDay(day); }}
                                        onPointerLeave={() => setHoveredDay(null)}
                                        onClick={() => onSelectDay?.(day)}
                                    >
                                        {day.milestones > 0 ? <span className={styles.milestone} aria-hidden="true" /> : day.events > 0 && getLevel(day) === 0 ? <span className={styles.dot} aria-hidden="true" /> : null}
                                    </Button>
                                ) : <span key={day.date} className={styles.outside} />)}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {showPreview && <div className={styles.preview} aria-live="polite">{preview ? getLabel(preview) : 'Focus or hover a day for details.'}</div>}
        </section>
    );
}
