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
export function getProgramDayStatusSymbol({ state, manualStatus = null, closed = false }) {
    if (manualStatus === 'complete') return 'complete';
    if (manualStatus === 'rest') return 'rest';
    if (state === 'scheduled_met') return 'complete';
    if (state === 'rest') return 'rest';
    return closed ? 'missed' : 'scheduled';
}

export function getProgramDayStateMeta(state) {
    return PROGRAM_DAY_STATE_META[state] || null;
}

/**
 * Named completed-session events for dates with no selected-program ribbon.
 * Scheduled dates keep only their ribbon; the day pane lists their sessions.
 */
export function buildUnscheduledSessionEvents(days = [], programId = null, calendarEvents = []) {
    const ribbonDates = new Set((calendarEvents || [])
        .filter((event) => event.extendedProps?.type === 'program_day'
            && String(event.extendedProps?.programId) === String(programId))
        .map((event) => String(event.start).slice(0, 10)));
    return (days || [])
        .filter((day) => !ribbonDates.has(day.date))
        .flatMap((day) => (day.completed_sessions || []).map((session, index) => ({
            id: `completed-session-${session.id}`,
            title: session.name,
            start: day.date,
            allDay: true,
            backgroundColor: 'transparent',
            borderColor: 'transparent',
            textColor: 'inherit',
            classNames: ['completed-session-event'],
            extendedProps: {
                type: 'completed_session',
                sessionId: session.id,
                programId,
                sortOrder: 1 + index / 1000,
            },
        })));
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
