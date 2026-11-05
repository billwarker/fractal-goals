import React from 'react';

import { InfoIcon } from '../atoms/AppIcons';
import IconButton from '../atoms/IconButton';
import Tooltip from '../atoms/Tooltip';
import styles from './AnalyticsFilterHeader.module.css';

/** Selection details stay beside the heading; the tooltip is portalled beyond scrolling panes. */
export default function AnalyticsFilterHeader({ title, summary, active, onClear, ignoredBy = null }) {
    const details = `${summary}${ignoredBy ? `. Not applied to ${ignoredBy}.` : ''}`;
    return (
        <div className="sessions-query-sidebar-section-header">
            <div className={styles.label}>
                <h4>{title}</h4>
                <Tooltip label={details} portal>
                    <IconButton size="sm" variant="plain" aria-label={`View ${title.toLowerCase()} filter selections`}
                        onClick={(event) => event.currentTarget.focus()}>
                        <InfoIcon size={14} />
                    </IconButton>
                </Tooltip>
            </div>
            <button type="button" className={`sessions-query-section-toggle ${styles.clear}`}
                disabled={!active} onClick={onClear} aria-label={`Clear ${title.toLowerCase()} filter`}>
                Clear
            </button>
        </div>
    );
}
