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

export function getProgramDayStateMeta(state) {
    return PROGRAM_DAY_STATE_META[state] || null;
}
