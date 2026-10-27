import React from 'react';
import { Link } from 'react-router-dom';

import styles from './ProgramDaysView.module.css';

export default function ExecutedPlanSessions({ rootId, sessions }) {
    return <>
            {sessions.length ? (
                <ul className={styles.executedList} aria-label="Sessions from this plan">
                    {sessions.map((session) => (
                        <li key={session.id}>
                            <Link to={`/${rootId}/session/${session.id}`}>
                                {session.completed ? 'Done' : 'In progress'}: {session.name}
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : null}

    </>;
}
