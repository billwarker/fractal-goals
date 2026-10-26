import React from 'react';
import { Link } from 'react-router-dom';

import SessionTemplateNameBadge from '../../common/SessionTemplateNameBadge';
import CompletionCheckBadge from '../../common/CompletionCheckBadge';
import styles from './CompletedSessionHeader.module.css';

export default function CompletedSessionHeader({ rootId, session, template }) {
    const attributes = session.attributes || {};

    return (
        <header className={styles.header}>
            <div className={styles.sessionIdentity}>
                <Link className={styles.sessionLink} to={`/${rootId}/session/${session.id}`}>
                    <SessionTemplateNameBadge name={session.name || template.name} color={template.color} wrap />
                </Link>
                {(session.completed ?? attributes.completed) ? <CompletionCheckBadge label="Completed session" /> : null}
            </div>
        </header>
    );
}
