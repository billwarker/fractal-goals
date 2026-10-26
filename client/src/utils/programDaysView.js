import { getProgramDayStatusSymbol } from './programDayState';

// Selection defaults for the Programs page Days tab. Shared by the page (which owns the
// side-pane navigator) and the lazily loaded Days view.

/** Whether a program day has a session template to plan. */
export function isPlannableDay(day) {
    return (day?.templates || []).length > 0;
}

/**
 * The default program day: the plannable day whose next date (today or later) comes first,
 * else the first plannable day, else the first day.
 */
export function pickDefaultDayId(days, occurrencesByDay, today) {
    const plannable = (days || []).filter(isPlannableDay);
    const nextDate = (day) => (occurrencesByDay?.get(String(day.id)) || [])
        .map((occurrence) => occurrence.date)
        .find((value) => value >= today);
    const upcoming = plannable
        .map((day) => ({ day, next: nextDate(day) }))
        .filter((entry) => entry.next)
        .sort((left, right) => left.next.localeCompare(right.next))[0]?.day;
    return (upcoming || plannable[0] || (days || [])[0])?.id || null;
}

/**
 * The date shown by default (the right-hand column when comparing): today when the day is
 * scheduled today, else its next date, else (once every date has passed) its last.
 */
export function pickDefaultDate(dates, today) {
    if (!dates.length) return null;
    return dates.find((value) => value >= today) || dates[dates.length - 1];
}

/** The same status symbol the calendar and day review use for an occurrence. */
export function occurrenceStatus(occurrence) {
    return getProgramDayStatusSymbol({
        state: occurrence.state,
        manualStatus: occurrence.manual_status,
        closed: Boolean(occurrence.closed),
        programDayCompleted: occurrence.program_day_completed,
    });
}

/**
 * One program day's dates by status symbol and its consistency, matching the server's block
 * rollups (services/program_rollups.py): ``scheduled`` counts every date and ``pending`` those
 * still to come; consistency is completed dates over completed and missed ones (rest days and
 * dates not yet due don't count).
 */
export function programDayStats(occurrences = []) {
    const statusCounts = { complete: 0, missed: 0, rest: 0, pending: 0, scheduled: 0 };
    (occurrences || []).forEach((occurrence) => {
        const status = occurrenceStatus(occurrence);
        statusCounts[status === 'scheduled' ? 'pending' : status] += 1;
        statusCounts.scheduled += 1;
    });
    const observed = statusCounts.complete + statusCounts.missed;
    return {
        statusCounts,
        consistency: {
            met_days: statusCounts.complete,
            scheduled_days_observed: observed,
            rate: observed ? statusCounts.complete / observed : null,
        },
    };
}

/**
 * The two columns: what to compare against, then the focused date. The comparison is the
 * program day's date just before the focused one. The first date shows alone.
 */
export function pickComparisonDates(occurrences, focusDate) {
    const index = occurrences.findIndex((occurrence) => occurrence.date === focusDate);
    if (index < 0) return [];
    return index > 0 ? [occurrences[index - 1].date, focusDate] : [focusDate];
}

/**
 * Caption for a column: Last completed, Today, Latest (most recent past), Next (first
 * upcoming), Past, or Upcoming. `isComparison` marks the left column.
 */
export function describeOccurrenceDate(date, dates, today, { completed = false, isComparison = false } = {}) {
    if (isComparison && completed && date <= today) return 'Last completed';
    if (date === today) return 'Today';
    if (date < today) {
        const latest = dates.filter((value) => value < today).pop();
        return date === latest ? 'Latest' : 'Past';
    }
    return date === dates.find((value) => value > today) ? 'Next' : 'Upcoming';
}

export function findProgramDay(days, dayId) {
    const day = (days || []).find((candidate) => String(candidate.id) === String(dayId));
    return day ? { day } : null;
}

/** DOM id of a template's plan card on one date, so the navigator can bring it into view. */
export function planCardElementId(templateId, date) {
    return `program-plan-card-${templateId}-${date}`;
}

/**
 * The Days tab's resolved selection: the program day, its dates, and the two columns.
 * The right column (`date`, rail B) is the date in view (by default today's, else the next);
 * the left column (`compareDate`, rail A) defaults to the date just before it, unless the
 * user picked one (or, with nothing earlier, the next date). Without `compare`, or for a day
 * with a single date, only the right column shows.
 */
export function resolveDaysSelection({ days, occurrencesByDay, selection, today, compare = false }) {
    const dayId = selection?.dayId || pickDefaultDayId(days, occurrencesByDay, today);
    const found = (dayId ? findProgramDay(days, dayId) : null) || findProgramDay(days, pickDefaultDayId(days, occurrencesByDay, today));
    const occurrences = (found && occurrencesByDay?.get(String(found.day.id))) || [];
    const dates = occurrences.map((occurrence) => occurrence.date);
    const date = (selection?.date && dates.includes(selection.date) ? selection.date : null)
        || pickDefaultDate(dates, today);
    const chosenCompare = selection?.compareDate;
    const fallbackCompare = () => {
        if (!date) return null;
        const [before] = pickComparisonDates(occurrences, date);
        if (before && before !== date) return before;
        // Nothing earlier: compare against the next date so both rails stay available.
        return dates[dates.indexOf(date) + 1] || null;
    };
    const compareDate = !compare ? null : chosenCompare && chosenCompare !== date && dates.includes(chosenCompare)
        ? chosenCompare
        : fallbackCompare();
    const hasCompare = Boolean(compareDate && compareDate !== date);
    return {
        found,
        occurrences,
        date,
        compareDate: hasCompare ? compareDate : null,
        columnDates: date ? (hasCompare ? [compareDate, date] : [date]) : [],
    };
}

/**
 * Which compared column copies from (and compares with) the other: the target is the
 * plannable one (today or later), so a past date never receives a copy. The right column
 * (`date`) is the target unless only the left (`compareDate`) is plannable. Nulls without
 * a comparison.
 */
export function pickCopyColumns({ date, compareDate, today }) {
    if (!date || !compareDate) return { sourceDate: null, targetDate: null };
    const leftOnly = date < today && compareDate >= today;
    return leftOnly
        ? { sourceDate: date, targetDate: compareDate }
        : { sourceDate: compareDate, targetDate: date };
}

/**
 * Alignment keys for a plan card's rows: the card, each section, and each item as
 * "<template>|<kind>:<id>#<n>", where n counts earlier items with the same activity or
 * circuit. Two columns showing the same program day then share keys for matching rows.
 */
export function planAlignmentKeys(templateId, sections) {
    const counts = new Map();
    const keyFor = (base) => {
        const n = counts.get(base) || 0;
        counts.set(base, n + 1);
        return `${templateId}|${base}#${n}`;
    };
    return {
        card: `${templateId}|card`,
        sections: (sections || []).map((section) => keyFor(`s:${section.name}`)),
        items: (sections || []).map((section) => (section.items || []).map((item) => (
            item.type === 'circuit'
                ? keyFor(`c:${item.circuit_definition_id}`)
                : keyFor(`a:${item.activity_definition_id || item.activity_id || item.id}`)
        ))),
    };
}

/**
 * A row inside an aligned item (a set table header, a set, a flat value row, a circuit round,
 * or one activity within a round), so compared plans line up row by row, not just by item.
 * Undefined without an item key, so the row takes no part in alignment.
 */
export function planRowAlignKey(itemAlignKey, kind, index = 0) {
    return itemAlignKey ? `${itemAlignKey}|${kind}#${index}` : undefined;
}

/**
 * Pairs rows of two columns that share a key, preserving order in both (a greedy common
 * subsequence), so a reordered item never produces crossed pairs. Returns index pairs.
 */
export function pairAlignmentKeys(leftKeys, rightKeys) {
    const pairs = [];
    let from = 0;
    leftKeys.forEach((key, leftIndex) => {
        const rightIndex = rightKeys.indexOf(key, from);
        if (rightIndex < 0) return;
        pairs.push([leftIndex, rightIndex]);
        from = rightIndex + 1;
    });
    return pairs;
}

/**
 * A date picked in one column's rail. Rail B (`isFocus`) plans another date and rail A
 * follows automatically unless the user chose it; rail A compares against a chosen date.
 * Picking the date the other column shows swaps the two columns.
 */
export function pickColumnDate({ isFocus, nextDate, date, compareDate }) {
    if (isFocus) {
        return nextDate === compareDate ? { date: nextDate, compareDate: date } : { date: nextDate };
    }
    return nextDate === date ? { date: compareDate, compareDate: nextDate } : { date, compareDate: nextDate };
}
