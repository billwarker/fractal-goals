import React, { useMemo, useState } from 'react';

import { useSessions } from '../../../hooks/useSessionQueries';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function getSessionTimestamp(session) {
    const data = session.attributes?.session_data || session.session_data || {};
    return data.session_start || session.session_start || session.created_at || session.attributes?.created_at || null;
}

function dayKey(date) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function startOfWeek(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Month/week calendar highlighting days that have sessions. Self-contained so
 * it works as a standalone surface widget; grain persists in widget state.
 */
export default function CalendarWidget({ state, onStateChange, sharedData }) {
    const rootId = sharedData?.rootId;
    const { data: sessions } = useSessions(rootId);
    const grain = state?.grain === 'week' ? 'week' : 'month';
    const [anchor, setAnchor] = useState(() => new Date());

    const sessionDays = useMemo(() => {
        const set = new Set();
        for (const session of Array.isArray(sessions) ? sessions : []) {
            const ts = getSessionTimestamp(session);
            if (ts) set.add(dayKey(new Date(ts)));
        }
        return set;
    }, [sessions]);

    const cells = useMemo(() => {
        if (grain === 'week') {
            const start = startOfWeek(anchor);
            return Array.from({ length: 7 }, (_, i) => {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                return d;
            });
        }
        const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        const gridStart = startOfWeek(first);
        return Array.from({ length: 42 }, (_, i) => {
            const d = new Date(gridStart);
            d.setDate(gridStart.getDate() + i);
            return d;
        });
    }, [grain, anchor]);

    const setGrain = (next) => onStateChange?.({ grain: next });
    const shift = (dir) => {
        const d = new Date(anchor);
        if (grain === 'week') d.setDate(d.getDate() + dir * 7);
        else d.setMonth(d.getMonth() + dir);
        setAnchor(d);
    };

    const title = grain === 'week'
        ? `Week of ${startOfWeek(anchor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        : anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    return (
        <div className="surface-calendar" data-no-panel-drag="true">
            <div className="surface-calendar-header">
                <button type="button" className="surface-calendar-nav" onClick={() => shift(-1)} aria-label="Previous">‹</button>
                <span className="surface-calendar-title">{title}</span>
                <button type="button" className="surface-calendar-nav" onClick={() => shift(1)} aria-label="Next">›</button>
                <div className="surface-calendar-grain">
                    <button type="button" className={grain === 'month' ? 'active' : ''} onClick={() => setGrain('month')}>Month</button>
                    <button type="button" className={grain === 'week' ? 'active' : ''} onClick={() => setGrain('week')}>Week</button>
                </div>
            </div>
            <div className="surface-calendar-grid">
                {DAY_LABELS.map((label) => (
                    <div key={label} className="surface-calendar-daylabel">{label}</div>
                ))}
                {cells.map((d) => {
                    const inMonth = grain === 'week' || d.getMonth() === anchor.getMonth();
                    const hasSession = sessionDays.has(dayKey(d));
                    return (
                        <div
                            key={d.toISOString()}
                            className={`surface-calendar-cell ${inMonth ? '' : 'surface-calendar-cell-muted'} ${hasSession ? 'surface-calendar-cell-active' : ''}`}
                        >
                            <span>{d.getDate()}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
