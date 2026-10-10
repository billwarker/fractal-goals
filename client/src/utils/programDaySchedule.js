/** Canonical client projection of weekday rules, explicit dates, and date exclusions. */
import { formatLiteralDate, getDatePart, getRecurringDatesWithinRange } from './dateUtils';

const DAY_NAME_TO_INDEX = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
};

function getProgramDayWeekdayIndexes(day) {
    const dayOfWeek = Array.isArray(day?.day_of_week)
        ? day.day_of_week
        : (day?.day_of_week ? [day.day_of_week] : []);

    return [...new Set(dayOfWeek
        .map((dayName) => DAY_NAME_TO_INDEX[dayName])
        .filter((value) => value !== undefined))];
}

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function getProgramDayWeekdays(day) {
    const dayOfWeek = Array.isArray(day?.day_of_week)
        ? day.day_of_week
        : (day?.day_of_week ? [day.day_of_week] : []);
    return WEEKDAY_NAMES.filter((name) => dayOfWeek.includes(name));
}

/** A definition's specific dates: its explicit schedule rows. */
export function getProgramDaySpecificDates(day) {
    const dates = (day?.scheduled_dates || []).map(getDatePart).filter(Boolean);
    return [...new Set(dates)].sort();
}

function joinWithAnd(parts) {
    if (parts.length <= 1) return parts[0] || '';
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const formatShortDate = (value) => formatLiteralDate(value, { year: undefined });

/** "Every Monday, Wednesday and Friday in the program." */
export function formatWeekdaySchedule(weekdays = []) {
    const ordered = WEEKDAY_NAMES.filter((name) => weekdays.includes(name));
    if (!ordered.length) return '';
    if (ordered.length === 7) return 'Every day in the program.';
    return `Every ${joinWithAnd(ordered)} in the program.`;
}

/** "1 date · Sep 26" or "3 dates · Sep 26 – Oct 10". */
export function formatSpecificDatesSummary(dates = []) {
    const sorted = [...dates].sort();
    if (!sorted.length) return '';
    const count = `${sorted.length} date${sorted.length === 1 ? '' : 's'}`;
    const range = sorted.length === 1
        ? formatShortDate(sorted[0])
        : `${formatShortDate(sorted[0])} – ${formatShortDate(sorted[sorted.length - 1])}`;
    return `${count} · ${range}`;
}

/** Compact schedule label for a program-day card: weekdays, dates, or both. */
export function getProgramDayScheduleLabel(day) {
    const weekdays = getProgramDayWeekdays(day);
    const dates = getProgramDaySpecificDates(day);
    if (weekdays.length) {
        const weekdayLabel = weekdays.length === 7 ? 'Daily' : weekdays.map((name) => name.slice(0, 3)).join(' · ');
        return dates.length ? `${weekdayLabel} · +${dates.length} date${dates.length === 1 ? '' : 's'}` : weekdayLabel;
    }
    if (!dates.length) return '';
    if (dates.length <= 2) return dates.map(formatShortDate).join(', ');
    return `${formatShortDate(dates[0])} +${dates.length - 1} more`;
}

export function getProgramDayScheduledDates(day, program) {
    const programStart = getDatePart(program?.start_date);
    const programEnd = getDatePart(program?.end_date);
    if (!programStart || !programEnd) {
        return [];
    }

    // Mirrors services/program_day_occurrences.program_day_scheduled_on: a definition occurs
    // on its explicit schedule dates and its weekdays, anywhere in the program.
    const explicitScheduleDates = (day?.scheduled_dates || [])
        .map(getDatePart)
        .filter((dateStr) => dateStr && dateStr >= programStart && dateStr <= programEnd);
    const activeDays = getProgramDayWeekdayIndexes(day);
    const recurringDates = activeDays.length
        ? getRecurringDatesWithinRange(programStart, programEnd, activeDays)
        : [];

    const excluded = new Set((day?.excluded_dates || []).map(getDatePart));
    return [...new Set([...explicitScheduleDates, ...recurringDates])]
        .filter((date) => !excluded.has(date)).sort();
}

