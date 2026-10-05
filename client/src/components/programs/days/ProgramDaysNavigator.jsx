import React, { useEffect, useRef, useState } from 'react';

import ChevronIcon from '../../atoms/ChevronIcon';
import EditIcon from '../../atoms/EditIcon';
import SessionTemplateNameBadge from '../../common/SessionTemplateNameBadge';
import { formatLiteralDate } from '../../../utils/dateUtils';
import { isPlannableDay, programDayStats } from '../../../utils/programDaysView';
import { getProgramDayScheduleLabel } from '../../../utils/programViewModel';
import { consistencyFigure } from '../blocks/BlockHeaderStats';
import ProgramDayStatusCounts from '../ProgramDayStatusCounts';
import { ProgramPlusIcon } from '../ProgramSvgIcons';
import styles from './ProgramDaysNavigator.module.css';

function scheduleSummary(day, occurrences, today) {
    const schedule = getProgramDayScheduleLabel(day) || 'Not scheduled';
    const next = (occurrences || []).find((occurrence) => occurrence.date >= today)?.date;
    if (!next) return schedule;
    const nextLabel = next === today ? 'today' : formatLiteralDate(next, { weekday: 'short', year: undefined });
    return `${schedule} · Next ${nextLabel}`;
}

/** A day's dates by status and its consistency, once it has dates. */
function DayStats({ name, occurrences }) {
    if (!occurrences?.length) return null;
    const { statusCounts, consistency } = programDayStats(occurrences);
    const figure = consistencyFigure(consistency);
    return (
        <div className={styles.stats}>
            <ProgramDayStatusCounts counts={statusCounts} label={`${name} results by status`} size="sm" />
            <span
                className={styles.consistency}
                title={figure.detail ? `Consistency: ${figure.detail} completed` : 'No completed or missed dates yet'}
            >
                <span className={styles.visuallyHidden}>Consistency </span>
                <span className={styles.consistencyValue}>{figure.value}</span>
                {figure.detail ? <span className={styles.consistencyDetail}>{figure.detail}</span> : null}
            </span>
        </div>
    );
}

/**
 * Side-pane selector for the Days tab: every program day once, in the program's order, with
 * its schedule, its dates by status with consistency, and its templates. Program days belong to the program, so this is also where new
 * days are created. Choosing a template selects its day and brings that template's plan into
 * view; each column's date rail lives in the main area. The compare toggle adds a second column.
 */
export default function ProgramDaysNavigator({
    days,
    occurrencesByDay = null,
    selectedDayId,
    onSelectDay,
    onSelectTemplate,
    onCreateDay = null,
    onEditDay = null,
    onMoveDay = null,
    today = '',
    compare = false,
    onCompareChange,
}) {
    // After a move the list re-renders in its new order: keep focus on the moved day's arrow
    // (or its other arrow at an end) and announce the new position.
    const navRef = useRef(null);
    const [moved, setMoved] = useState(null);
    const [announcement, setAnnouncement] = useState('');
    useEffect(() => {
        if (!moved || !navRef.current) return;
        const buttons = [moved.direction, moved.direction === 'up' ? 'down' : 'up']
            .map((direction) => navRef.current.querySelector(`[data-move="${moved.dayId}:${direction}"]`));
        (buttons.find((button) => button && !button.disabled) || buttons[0])?.focus();
    }, [moved, days]);
    const move = (day, direction, index) => {
        const to = index + (direction === 'up' ? -1 : 1);
        setMoved({ dayId: String(day.id), direction });
        setAnnouncement(`${day.name || 'Program day'} moved to position ${to + 1} of ${days.length}`);
        onMoveDay(day.id, direction === 'up' ? -1 : 1);
    };

    // New days are created from a footer pinned to the bottom of the pane.
    const footer = onCreateDay ? (
        <div className={styles.footer}>
            <button type="button" className={styles.createDay} onClick={onCreateDay}>
                <ProgramPlusIcon size={14} />
                New program day
            </button>
        </div>
    ) : null;

    if (!days?.length) {
        return (
            <div className={styles.navigator}>
                <p className={styles.empty}>
                    Program days hold the sessions you plan. Give one weekdays and it repeats across the whole program.
                </p>
                {footer}
            </div>
        );
    }
    return (
        <nav className={styles.navigator} aria-label="Program days" ref={navRef}>
            <p className={styles.visuallyHidden} aria-live="polite">{announcement}</p>
            {onCompareChange ? (
                <div className={styles.toolbar}>
                    <button
                        type="button"
                        className={styles.compareToggle}
                        aria-pressed={compare}
                        onClick={() => onCompareChange(!compare)}
                    >
                        <span>Compare two days</span>
                        <span className={styles.switch} aria-hidden="true">
                            <span className={styles.switchThumb} />
                        </span>
                    </button>
                </div>
            ) : null}
            <ul className={styles.days}>
                {days.map((day, index) => {
                    const selected = String(day.id) === String(selectedDayId);
                    const plannable = isPlannableDay(day);
                    const name = day.name || 'Program day';
                    const occurrences = occurrencesByDay?.get(String(day.id));
                    return (
                        // The whole container scopes its day for pointer users; the day-name
                        // button is the keyboard control. Inner buttons handle their own clicks.
                        <li
                            key={day.id}
                            className={`${styles.day} ${selected ? styles.daySelected : ''}`}
                            onClick={(event) => {
                                if (event.target.closest('button')) return;
                                onSelectDay(day.id);
                            }}
                        >
                            <div className={styles.dayHeader}>
                                <button
                                    type="button"
                                    className={styles.dayName}
                                    aria-current={selected ? 'true' : undefined}
                                    onClick={() => onSelectDay(day.id)}
                                >
                                    <span className={styles.dayTitle}>{name}</span>
                                    <span className={styles.daySchedule}>
                                        {scheduleSummary(day, occurrences, today)}
                                    </span>
                                </button>
                                {onMoveDay && days.length > 1 ? (
                                    <span className={styles.moveButtons}>
                                        <button
                                            type="button"
                                            className={styles.iconButton}
                                            data-move={`${day.id}:up`}
                                            onClick={() => move(day, 'up', index)}
                                            disabled={index === 0}
                                            aria-label={`Move ${name} up`}
                                            title="Move up"
                                        >
                                            <ChevronIcon size={14} direction="up" />
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.iconButton}
                                            data-move={`${day.id}:down`}
                                            onClick={() => move(day, 'down', index)}
                                            disabled={index === days.length - 1}
                                            aria-label={`Move ${name} down`}
                                            title="Move down"
                                        >
                                            <ChevronIcon size={14} direction="down" />
                                        </button>
                                    </span>
                                ) : null}
                                {onEditDay ? (
                                    <button
                                        type="button"
                                        className={styles.iconButton}
                                        onClick={() => onEditDay(day)}
                                        aria-label={`Edit ${name}`}
                                        title="Edit day"
                                    >
                                        <EditIcon size={14} />
                                    </button>
                                ) : null}
                            </div>
                            <DayStats name={name} occurrences={occurrences} />
                            {plannable ? (
                                <ul className={styles.templates} aria-label={`${name} templates`}>
                                    {day.templates.map((template) => (
                                        <li key={template.id}>
                                            <button
                                                type="button"
                                                className={styles.template}
                                                onClick={() => onSelectTemplate(day.id, template.id)}
                                                aria-label={`Plan ${template.name} for ${name}`}
                                            >
                                                <SessionTemplateNameBadge entity={template} size="sm" wrap />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className={styles.noTemplates}>Add a session template to plan this day.</p>
                            )}
                        </li>
                    );
                })}
            </ul>
            {footer}
        </nav>
    );
}
