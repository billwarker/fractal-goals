import React from 'react';

import FilterSelectionTooltip from '../common/FilterSelectionTooltip';
import styles from './AnalyticsFilterHeader.module.css';

/** Selection details stay beside the heading; the tooltip is portalled beyond scrolling panes. */
export default function AnalyticsFilterHeader({ title, summary, active, onClear, ignoredBy = null }) {
    const details = `${summary}${ignoredBy ? `. Not applied to ${ignoredBy}.` : ''}`;
    return (
        <div className="sessions-query-sidebar-section-header">
            <div className={styles.label}>
                <h4>{title}</h4>
                {active ? <FilterSelectionTooltip title={title} details={details} /> : null}
            </div>
            <button type="button" className={`sessions-query-section-toggle ${styles.clear}`}
                disabled={!active} onClick={onClear} aria-label={`Clear ${title.toLowerCase()} filter`}>
                Clear
            </button>
        </div>
    );
}
