import { useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';
import { calculatePausedSeconds } from '../hooks/useSessionDuration';
import { useActiveSession } from '../hooks/useSessionQueries';
import { queryKeys } from '../hooks/queryKeys';
import { syncApi } from '../utils/api/syncApi';
import { planReminders, remindersOn, subscribeReminders } from './reminders';
import { onAppMenu, scheduleReminders, showSessionTimer } from '.';

// Pages outside a fractal, which never become the fractal the menus open.
const NOT_FRACTALS = new Set(['', 'admin', 'reset-password', 'storage', 'privacy', 'terms']);
const HOUR = 60 * 60 * 1000;

/** The menu-bar timer's view of a session: time worked, not counting pauses. */
export function timerSession(session, rootId, now = Date.now()) {
    const started = session?.session_start ? new Date(session.session_start).getTime() : NaN;
    if (!session?.id || Number.isNaN(started)) return null;
    const elapsed = Math.floor((now - started) / 1000) - calculatePausedSeconds(session, now);
    return {
        title: session.name || 'Session',
        path: `/${session.root_id || rootId}/session/${session.id}`,
        elapsedSeconds: Math.max(0, elapsed),
        running: !session.is_paused,
    };
}

/** Where a menu choice leads, or null when it leads nowhere from here. */
export function menuDestination(id, rootId) {
    if (id === 'fractals') return '/';
    if (id === 'back') return -1;
    if (id === 'forward') return 1;
    if (!rootId) return id === 'new-session' || id.startsWith('page:') ? '/' : null;
    if (id === 'new-session') return `/${rootId}/create-session`;
    if (id.startsWith('page:')) return `/${rootId}/${id.slice('page:'.length)}`;
    return null;
}

/**
 * The Mac app's menus, menu-bar timer and reminders, for the signed-in person. Rendered only inside
 * a shell; signing out takes the timer and reminders away with it.
 */
export default function NativeShellBridge({ onOpenSettings }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const segment = location.pathname.split('/')[1] || '';
    // The fractal last open, kept while on pages outside any fractal.
    const [rootId, setRootId] = useState(null);
    if (!NOT_FRACTALS.has(segment) && segment !== rootId) setRootId(segment);
    const { data: activeSession } = useActiveSession(user?.id, rootId);

    const choose = useEffectEvent((id) => {
        if (id === 'settings') return onOpenSettings();
        const destination = menuDestination(id, rootId);
        if (destination !== null) navigate(destination);
    });
    useEffect(() => onAppMenu((id) => choose(id)), []);

    useEffect(() => {
        void showSessionTimer(timerSession(activeSession, rootId));
    }, [activeSession, rootId]);
    useEffect(() => () => void showSessionTimer(null), []);

    const wanted = useSyncExternalStore(subscribeReminders, remindersOn);
    const upcoming = useQuery({
        queryKey: queryKeys.upcomingReminders(user?.id),
        queryFn: async () => (await syncApi.getUpcomingReminders(Intl.DateTimeFormat().resolvedOptions().timeZone)).data,
        enabled: Boolean(wanted && user?.id),
        refetchInterval: HOUR,
        staleTime: HOUR / 4,
    });
    useEffect(() => {
        if (!wanted) void scheduleReminders([]);
        else if (upcoming.data) void scheduleReminders(planReminders(upcoming.data, activeSession));
    }, [wanted, upcoming.data, activeSession]);
    useEffect(() => () => void scheduleReminders([]), []);

    return null;
}
