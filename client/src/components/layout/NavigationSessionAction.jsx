import React from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';

import { useActiveSession, useSessionDetail } from '../../hooks/useSessionQueries';
import CompletionCheckBadge from '../common/CompletionCheckBadge';
import styles from '../../AppRouter.module.css';

function NavigationSessionAction({ rootId, userId, isMobile = false, onClick }) {
    const location = useLocation();
    const { data: activeSession } = useActiveSession(userId, rootId);
    const sessionRouteMatch = matchPath('/:routeRootId/session/:routeSessionId', location.pathname);
    const routeRootId = sessionRouteMatch?.params?.routeRootId || null;
    const routeSessionId = sessionRouteMatch?.params?.routeSessionId || null;
    const { data: routeSession } = useSessionDetail(routeRootId, routeSessionId);
    const routeSessionCompleted = routeSession?.completed ?? routeSession?.attributes?.completed;
    const unfinishedRouteSession = routeSession?.id && routeSessionCompleted !== true
        ? routeSession
        : null;
    const currentSession = activeSession || unfinishedRouteSession;
    const currentSessionRootId = currentSession?.root_id || routeRootId || rootId;
    const activePath = currentSession?.id && currentSessionRootId
        ? `/${currentSessionRootId}/session/${currentSession.id}`
        : null;
    const isPaused = Boolean(currentSession?.is_paused ?? currentSession?.attributes?.is_paused);
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
