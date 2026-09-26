import { addDaysToDateString } from './dateUtils';

export const PROGRAM_DAY_STATE_META = {
    scheduled_met: { label: 'requirements met' },
    scheduled_partial: { label: 'partially complete' },
    scheduled_missed: { label: 'missed' },
    scheduled_pending: { label: 'pending' },
    unscheduled_evidence: { label: 'unscheduled evidence' },
    rest: { label: 'rest day' },
    upcoming: { label: 'upcoming' },
};

export function indexProgramDayStates(days = []) {
    return new Map((days || []).map((day) => [day.date, day]));
}

/**
 * Symbol shared by the calendar ribbon, day pane, and status menus: complete,
 * rest, missed, or scheduled. A manual status wins over the evaluated state.
 */
export function getProgramDayStatusSymbol({
    state, manualStatus = null, closed = false, programDayCompleted,
}) {
    if (manualStatus === 'complete') return 'complete';
    if (manualStatus === 'rest') return 'rest';
    if (typeof programDayCompleted === 'boolean') {
        if (programDayCompleted) return 'complete';
        if (state === 'rest') return 'rest';
        return closed ? 'missed' : 'scheduled';
    }
    if (state === 'scheduled_met') return 'complete';
    if (state === 'rest') return 'rest';
    return closed ? 'missed' : 'scheduled';
}

export function getProgramDayStateMeta(state) {
    return PROGRAM_DAY_STATE_META[state] || null;
}

/** Merge per-program day summaries while retaining each session's credited day links. */
export function mergeCompletedSessionDays(...dayCollections) {
    const daysByDate = new Map();
    dayCollections.flat().forEach((day) => {
        if (!day?.date) return;
        if (!daysByDate.has(day.date)) daysByDate.set(day.date, new Map());
        const sessions = daysByDate.get(day.date);
        (day.completed_sessions || []).forEach((session) => {
            if (session?.id == null) return;
            const key = String(session.id);
            const existing = sessions.get(key);
            if (!existing) {
                sessions.set(key, session);
                return;
            }
            sessions.set(key, {
                ...existing,
                ...session,
                program_day_ids: [...new Set([
                    ...(existing.program_day_ids || []).map(String),
                    ...(existing.program_day_id ? [String(existing.program_day_id)] : []),
                    ...(session.program_day_ids || []).map(String),
                    ...(session.program_day_id ? [String(session.program_day_id)] : []),
                ])],
            });
        });
    });
    return [...daysByDate].map(([date, sessions]) => ({
        date,
        completed_sessions: [...sessions.values()],
    }));
}

/** Display completed session events on every date, alongside any scheduled day ribbon. */
export function buildCompletedSessionEvents(days = [], programId = null) {
    return (days || []).flatMap((day) => {
        const groups = new Map();
        (day.completed_sessions || []).forEach((session, index) => {
            const programDayIds = [...new Set([
                ...(session.program_day_id ? [String(session.program_day_id)] : []),
                ...(session.program_day_ids || []).map(String),
            ])].sort();
            const templateKey = session.template_id
                ? `template:${session.template_id}`
                : session.template_name?.trim()
                    ? `template-name:${session.template_name.trim().toLocaleLowerCase()}`
                    : `session:${session.id}`;
            const groupKey = `${templateKey}|program-days:${programDayIds.join(',')}`;
            const group = groups.get(groupKey);
            if (group) group.sessions.push(session);
            else groups.set(groupKey, { sessions: [session], sortOrder: 1 + index / 1000, programDayIds });
        });

        return [...groups.values()].map(({ sessions, sortOrder, programDayIds }) => {
            const representative = sessions[0];
            return {
                id: `completed-session-${representative.id}`,
                title: representative.name,
                start: day.date,
                allDay: true,
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                textColor: 'inherit',
                classNames: ['completed-session-event'],
                extendedProps: {
                    type: 'completed_session',
                    sessionId: representative.id,
                    sessionIds: sessions.map((session) => session.id),
                    count: sessions.length,
                    programDayIds,
                    programId,
                    templateName: representative.template_name || null,
                    templateColor: representative.template_color || null,
                    sortOrder,
                },
            };
        });
    });
}

/** Place credited sessions inside their matching program-day ribbon. */
export function nestContributingSessionsInProgramDays(events = []) {
    const ribbonIndexes = new Map();
    events.forEach((event, index) => {
        if (event.extendedProps?.type !== 'program_day') return;
        const key = `${event.start}:${event.extendedProps.pDayId}`;
        if (!ribbonIndexes.has(key)) ribbonIndexes.set(key, index);
    });

    const nestedByIndex = new Map();
    const standalone = [];
    events.forEach((event) => {
        if (event.extendedProps?.type !== 'completed_session') {
            standalone.push(event);
            return;
        }
        const matchingIndexes = [...new Set((event.extendedProps.programDayIds || [])
            .map((dayId) => ribbonIndexes.get(`${event.start}:${dayId}`))
            .filter((index) => index !== undefined))];
        if (matchingIndexes.length === 0) {
            standalone.push(event);
            return;
        }
        matchingIndexes.forEach((index) => {
            if (!nestedByIndex.has(index)) nestedByIndex.set(index, []);
            nestedByIndex.get(index).push(event);
        });
    });

    return standalone.map((event) => {
        const index = events.indexOf(event);
        const sessions = nestedByIndex.get(index);
        return sessions ? {
            ...event,
            extendedProps: { ...event.extendedProps, contributingSessions: sessions },
        } : event;
    });
}

export const CALENDAR_PERIOD_KIND_LABELS = {
    vacation: 'Vacation',
    travel: 'Travel',
    illness: 'Illness',
    other: 'Event',
};

/** One spanning all-day event per calendar period (time off). */
export function buildCalendarPeriodEvents(periods = [], programId = null) {
    return (periods || []).map((period) => ({
        id: `calendar-period-${period.id}`,
        title: period.name,
        start: period.start_date,
        end: addDaysToDateString(period.end_date, 1),
        allDay: true,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        textColor: 'inherit',
        classNames: ['calendar-period-event'],
        extendedProps: {
            type: 'calendar_period',
            programId,
            period,
            kindLabel: CALENDAR_PERIOD_KIND_LABELS[period.kind] || CALENDAR_PERIOD_KIND_LABELS.other,
            sortOrder: -5,
        },
    }));
}
