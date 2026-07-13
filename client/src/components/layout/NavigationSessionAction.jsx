import React from 'react';
import { Link } from 'react-router-dom';

import { useActiveSession } from '../../hooks/useSessionQueries';
import CompletionCheckBadge from '../common/CompletionCheckBadge';
import styles from '../../AppRouter.module.css';

function NavigationSessionAction({ rootId, userId, isMobile = false, onClick }) {
    const { data: activeSession } = useActiveSession(userId);
    const activePath = activeSession?.id && activeSession?.root_id
        ? `/${activeSession.root_id}/session/${activeSession.id}`
        : null;
    const isPaused = Boolean(activeSession?.is_paused ?? activeSession?.attributes?.is_paused);
    const label = activePath
        ? (isPaused ? 'SESSION PAUSED' : 'SESSION IN PROGRESS')
        : '+ ADD SESSION';
    const className = [
        styles.addSessionBtn,
        activePath ? styles.activeSessionAction : '',
        isPaused ? styles.pausedSessionAction : '',
        isMobile ? styles.mobileBtn : '',
        isMobile ? styles.mobileTopAddBtn : '',
    ].filter(Boolean).join(' ');

    return (
        <Link to={activePath || `/${rootId}/create-session`} className={className} onClick={onClick}>
            <span>{label}</span>
            {activePath && (
                <CompletionCheckBadge
                    checked={false}
                    inProgress={!isPaused}
                    paused={isPaused}
                    label={isPaused ? 'Paused session' : 'Session in progress'}
                    className={styles.navSessionStatus}
                />
            )}
        </Link>
    );
}

export default NavigationSessionAction;
