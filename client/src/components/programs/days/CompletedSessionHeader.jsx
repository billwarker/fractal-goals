import React from 'react';
import { Link } from 'react-router-dom';

import SessionTemplateNameBadge from '../../common/SessionTemplateNameBadge';
import CompletionCheckBadge from '../../common/CompletionCheckBadge';
import { useTimezone } from '../../../contexts/TimezoneContext';
import { calculateSessionDuration } from '../../../hooks/useSessionDuration';
import { formatDateTimeParts } from '../../../utils/formatters';
import { formatClockDuration } from '../../../utils/sessionTime';
import styles from './CompletedSessionHeader.module.css';

export default function CompletedSessionHeader({ rootId, session, template }) {
    const { timezone } = useTimezone();
    const attributes = session.attributes || {};
    const data = attributes.session_data || {};
    const timestamp = (value) => {
        const parts = formatDateTimeParts(value, timezone);
        return parts.date && parts.time ? `${parts.date} · ${parts.time}` : '—';
    };
    const fields = [
        ['Session start', timestamp(session.session_start || data.session_start || attributes.session_start)],
        ['Session end', timestamp(session.session_end || data.session_end || attributes.session_end)],
        ['Duration', formatClockDuration(calculateSessionDuration(session), '—')],
    ];

    return (
        <header className={styles.header}>
            <div className={styles.sessionIdentity}>
                <Link className={styles.sessionLink} to={`/${rootId}/session/${session.id}`}>
                    <SessionTemplateNameBadge name={session.name || template.name} color={template.color} wrap />
                </Link>
                {(session.completed ?? attributes.completed) ? <CompletionCheckBadge label="Completed session" /> : null}
            </div>
            <dl className={styles.metadata} aria-label="Session metadata">
                {fields.map(([label, value]) => (
                    <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
        </header>
    );
}
