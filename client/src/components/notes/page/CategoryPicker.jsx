import React from 'react';

import { NOTE_CATEGORIES } from '../../../utils/noteTypes';
import styles from './NotesFilters.module.css';

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
                        {category.label}
                    </button>
                );
            })}
        </div>
    );
}
