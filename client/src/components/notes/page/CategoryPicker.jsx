import React from 'react';

import { useGoalLevels } from '../../../contexts/GoalLevelsContext';
import { NOTE_CATEGORIES } from '../../../utils/noteTypes';
import { TimerIcon } from '../../analytics/AnalyticsIcons';
import { CalendarIcon } from '../../atoms/AppIcons';
import GoalIcon from '../../atoms/GoalIcon';
import styles from './NotesFilters.module.css';

/** Each category's icon, as the notes timeline's rail draws it. */
function CategoryIcon({ category }) {
    const { getGoalIcon } = useGoalLevels() || {};
    if (category === 'goals') {
        return (
            <GoalIcon
                shape={getGoalIcon?.('UltimateGoal') || 'circle'}
                color="currentColor"
                secondaryColor="var(--color-bg-input)"
                size={13}
            />
        );
    }
    if (category === 'sessions') return <TimerIcon size={13} />;
    if (category === 'programs') return <CalendarIcon size={13} />;
    return null;
}

/**
 * Multi-select note categories. Each option is an independent checkbox-style toggle;
 * selecting none means every category.
 */
export default function CategoryPicker({ value, onChange, labelledBy }) {
    const toggle = (category) => onChange(
        value.includes(category) ? value.filter((item) => item !== category) : [...value, category],
    );
    return (
        <div className={styles.categoryOptions} role="group" aria-labelledby={labelledBy}>
            {NOTE_CATEGORIES.map((category) => {
                const selected = value.includes(category.value);
                return (
                    <button key={category.value} type="button" className={styles.categoryOption}
                        aria-pressed={selected} onClick={() => toggle(category.value)}>
                        <span className={styles.categoryCheck} aria-hidden="true">{selected ? '✓' : ''}</span>
                        <span className={styles.categoryIcon} aria-hidden="true"><CategoryIcon category={category.value} /></span>
                        {category.label}
                    </button>
                );
            })}
        </div>
    );
}
