import React from 'react';

import SessionTemplateNameBadge from '../../common/SessionTemplateNameBadge';
import styles from './ProgramDaysNavigator.module.css';

export function plannableDayGroups(blocks) {
    return (blocks || [])
        .map((block) => ({ block, days: (block.days || []).filter((day) => (day.templates || []).length > 0) }))
        .filter((group) => group.days.length > 0);
}

/**
 * Side-pane selector for the Days tab: program days grouped by block, each with its
 * templates. Choosing a template selects its day and brings that template's plan into view;
 * each column's date rail lives in the main area. The compare toggle adds a second column.
 */
export default function ProgramDaysNavigator({
    blocks,
    selectedDayId,
    onSelectDay,
    onSelectTemplate,
    compare = false,
    onCompareChange,
}) {
    const groups = plannableDayGroups(blocks);
    if (!groups.length) {
        return <p className={styles.empty}>Add a program day with a session template to plan it here.</p>;
    }
    return (
        <nav className={styles.navigator} aria-label="Program days">
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
            {groups.map(({ block, days }) => (
                <section key={block.id} className={styles.group} aria-labelledby={`days-block-${block.id}`}>
                    <h3
                        id={`days-block-${block.id}`}
                        className={styles.block}
                        style={{ '--block-color': block.color || 'var(--color-border)' }}
                    >
                        {block.name}
                    </h3>
                    <ul className={styles.days}>
                        {days.map((day) => {
                            const selected = String(day.id) === String(selectedDayId);
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
                                    <button
                                        type="button"
                                        className={styles.dayName}
                                        aria-current={selected ? 'true' : undefined}
                                        onClick={() => onSelectDay(day.id)}
                                    >
                                        {day.name}
                                    </button>
                                    <ul className={styles.templates} aria-label={`${day.name} templates`}>
                                        {day.templates.map((template) => (
                                            <li key={template.id}>
                                                <button
                                                    type="button"
                                                    className={styles.template}
                                                    onClick={() => onSelectTemplate(day.id, template.id)}
                                                    aria-label={`Plan ${template.name} for ${day.name}`}
                                                >
                                                    <SessionTemplateNameBadge entity={template} size="sm" wrap />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </nav>
    );
}
