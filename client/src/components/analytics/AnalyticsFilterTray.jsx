import React from 'react';

import { FILTER_LABELS } from './visualizations/capabilities';
import styles from './AnalyticsFilterTray.module.css';

/** Optional filter choices form the bottom tray; active filters stay shown until cleared. */
export default function AnalyticsFilterTray({ optionalFilters, isVisible, active, onToggle }) {
    if (optionalFilters.length === 0) return null;
    return (
        <ul className={`sessions-query-sidebar-section sessions-query-sidebar-section-compact ${styles.filterTray}`} aria-label="Additional filters">
            {optionalFilters.map((id) => {
                const set = active.includes(id);
                return (
                    <li key={id}>
                        <button
                            type="button"
                            className={`sessions-query-chip ${isVisible(id) ? 'active' : ''}`}
                            aria-pressed={isVisible(id)}
                            disabled={set}
                            title={set ? 'Shown while it’s set' : undefined}
                            onClick={() => onToggle(id)}
                        >
                            {FILTER_LABELS[id]}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
