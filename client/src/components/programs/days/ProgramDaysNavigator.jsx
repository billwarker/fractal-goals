import React from 'react';

import styles from './ProgramDaysView.module.css';

/** Program days grouped by block; a select on narrow screens. */
export default function ProgramDaysNavigator({ blocks, selectedDayId, onSelect }) {
    const groups = blocks
        .map((block) => ({ block, days: (block.days || []).filter((day) => (day.templates || []).length > 0) }))
        .filter((group) => group.days.length > 0);

    return (
        <nav className={styles.navigator} aria-label="Program days">
            <label className={styles.navigatorSelect}>
                <span className={styles.visuallyHidden}>Program day</span>
                <select value={selectedDayId || ''} onChange={(event) => onSelect(event.target.value)}>
                    {groups.map(({ block, days }) => (
                        <optgroup key={block.id} label={block.name}>
                            {days.map((day) => <option key={day.id} value={day.id}>{day.name}</option>)}
                        </optgroup>
                    ))}
                </select>
            </label>
            <div className={styles.navigatorList}>
                {groups.map(({ block, days }) => (
                    <div key={block.id} className={styles.navigatorGroup}>
                        <h3 className={styles.navigatorBlock} style={{ borderColor: block.color || undefined }}>
                            {block.name}
                        </h3>
                        <ul>
                            {days.map((day) => (
                                <li key={day.id}>
                                    <button
                                        type="button"
                                        className={styles.navigatorDay}
                                        aria-current={String(day.id) === String(selectedDayId) ? 'true' : undefined}
                                        onClick={() => onSelect(day.id)}
                                    >
                                        <span>{day.name}</span>
                                        <small>{day.templates.length} template{day.templates.length === 1 ? '' : 's'}</small>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </nav>
    );
}
