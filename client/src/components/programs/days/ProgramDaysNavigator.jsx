import React from 'react';

import EditIcon from '../../atoms/EditIcon';
import SessionTemplateNameBadge from '../../common/SessionTemplateNameBadge';
import { formatLiteralDate } from '../../../utils/dateUtils';
import { isPlannableDay } from '../../../utils/programDaysView';
import { getProgramDayScheduleLabel } from '../../../utils/programViewModel';
import { ProgramPlusIcon } from '../ProgramSvgIcons';
import styles from './ProgramDaysNavigator.module.css';

function scheduleSummary(day, occurrences, today) {
    const schedule = getProgramDayScheduleLabel(day) || 'Not scheduled';
    const next = (occurrences || []).find((occurrence) => occurrence.date >= today)?.date;
    if (!next) return schedule;
    const nextLabel = next === today ? 'today' : formatLiteralDate(next, { weekday: 'short', year: undefined });
    return `${schedule} · Next ${nextLabel}`;
}

/**
 * Side-pane selector for the Days tab: every program day once, in the program's order, with
 * its schedule and templates. Program days belong to the program, so this is also where new
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
    today = '',
    compare = false,
    onCompareChange,
}) {
    const createButton = onCreateDay ? (
        <button type="button" className={styles.createDay} onClick={onCreateDay}>
            <ProgramPlusIcon size={14} />
            New program day
        </button>
    ) : null;

    if (!days?.length) {
        return (
            <div className={styles.navigator}>
                {createButton}
                <p className={styles.empty}>
                    Program days hold the sessions you plan. Give one weekdays and it repeats across the whole program.
                </p>
            </div>
        );
    }
    return (
        <nav className={styles.navigator} aria-label="Program days">
            {createButton}
            {onCompareChange ? (
                <label className={styles.compareToggle}>
                    <input
                        type="checkbox"
                        checked={compare}
                        onChange={(event) => onCompareChange(event.target.checked)}
                    />
                    Compare two days
                </label>
            ) : null}
            <ul className={styles.days}>
                {days.map((day) => {
                    const selected = String(day.id) === String(selectedDayId);
                    const plannable = isPlannableDay(day);
                    const name = day.name || 'Program day';
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
                                        {scheduleSummary(day, occurrencesByDay?.get(String(day.id)), today)}
                                    </span>
                                </button>
                                {onEditDay ? (
                                    <button
                                        type="button"
                                        className={styles.editDay}
                                        onClick={() => onEditDay(day)}
                                        aria-label={`Edit ${name}`}
                                        title="Edit day"
                                    >
                                        <EditIcon size={14} />
                                    </button>
                                ) : null}
                            </div>
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
        </nav>
    );
}
