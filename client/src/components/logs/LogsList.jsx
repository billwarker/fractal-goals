import React from 'react';

import Linkify from '../atoms/Linkify';
import { formatDateInTimezone } from '../../utils/dateUtils';
import { formatRelativeTime } from './logsRange';
import styles from './Logs.module.css';

// Sources are dotted names (module.function); let a long one wrap after its dots.
const breakAfterDots = (value) => value.split('.').flatMap((part, index) => (
    index === 0 ? [part] : ['.', <wbr key={index} />, part]
));

const EXACT_TIME = {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
};

function LogRow({ log, timezone, domainColors, now }) {
    const hasPayload = log.payload && Object.keys(log.payload).length > 0;
    const exact = formatDateInTimezone(log.timestamp, timezone, EXACT_TIME);
    return (
        <li className={styles.row}>
            <time className={styles.when} dateTime={log.timestamp} title={exact}>
                <span className={styles.relative}>{formatRelativeTime(log.timestamp, now)}</span>
                <span className={styles.exact}>{exact}</span>
            </time>
            <span className={styles.event}>
                <span
                    className={styles.domainDot}
                    style={{ background: domainColors[log.domain] || domainColors.other }}
                    aria-hidden="true"
                />
                <code className={`${styles.eventType} ${log.event_type?.endsWith('.deleted') ? styles.deleted : ''}`}>
                    {log.event_type}
                </code>
            </span>
            <div className={styles.description}>
                <Linkify>{log.description}</Linkify>
                {(log.entity_id || hasPayload) && (
                    <div className={styles.meta}>
                        {log.entity_id && <span className={styles.entity} title={log.entity_id}>ID {log.entity_id}</span>}
                        {hasPayload && (
                            <details className={styles.payload}>
                                <summary>Details</summary>
                                <pre>{JSON.stringify(log.payload, null, 2)}</pre>
                            </details>
                        )}
                    </div>
                )}
            </div>
            <span className={styles.source}>{breakAfterDots(log.source || 'system')}</span>
        </li>
    );
}

/** The event table on wide screens; each event becomes a card on phones. */
function LogsList({ logs, timezone, domainColors }) {
    const now = new Date();
    return (
        <div className={styles.list}>
            <div className={styles.listHeader} aria-hidden="true">
                <span>When</span>
                <span>Event</span>
                <span>Description</span>
                <span>Source</span>
            </div>
            <ol className={styles.rows} aria-label="Events, newest first">
                {logs.map((log) => (
                    <LogRow key={log.id} log={log} timezone={timezone} domainColors={domainColors} now={now} />
                ))}
            </ol>
        </div>
    );
}

export default LogsList;
