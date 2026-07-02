import React, { useMemo } from 'react';

import SessionCard from '../../sessions/SessionCard';
import { useSessions } from '../../../hooks/useSessionQueries';

function getSessionTimestamp(session) {
    const data = session.attributes?.session_data || session.session_data || {};
    return data.session_start || session.session_start || session.created_at || session.attributes?.created_at || 0;
}

/**
 * Compact card showing the user's most recent session. Reuses the real
 * SessionCard so it stays consistent with the Sessions page.
 */
export default function LastSessionWidget({ sharedData }) {
    const rootId = sharedData?.rootId;
    const { data: sessions, isLoading } = useSessions(rootId);

    const latest = useMemo(() => {
        const list = Array.isArray(sessions) ? sessions : [];
        if (!list.length) return null;
        return [...list].sort((a, b) => new Date(getSessionTimestamp(b)) - new Date(getSessionTimestamp(a)))[0];
    }, [sessions]);

    if (isLoading) {
        return <div className="surface-widget-empty">Loading session…</div>;
    }
    if (!latest) {
        return <div className="surface-widget-empty">No sessions yet.</div>;
    }

    return (
        <div className="surface-last-session" data-no-panel-drag="true">
            <SessionCard session={latest} rootId={rootId} />
        </div>
    );
}
