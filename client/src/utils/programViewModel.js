import {
    addDaysToDateString,
    formatLiteralDate,
    getDatePart,
    getDaysRemaining,
    getISOYMDInTimezone,
    getRecurringDatesWithinRange,
} from './dateUtils';
import { getGoalDeadline, isGoalAssociatedWithBlock } from './programGoalAssociations';
import { buildGoalDeadlineCalendarEvent } from './programCalendarGoalEvents';
import { buildProgramGoalScope } from './programGoalWindow';
import { isBlockActive } from './programUtils.jsx';

export const PROGRAM_COLORS = ['#3A86FF', '#06A77D', '#FFBE0B', '#EF476F', '#7B5CFF', '#4ECDC4'];

function getColorChannels(color) {
    if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color.trim())) {
        return null;
    }

    const normalized = color.trim();
    return {
        r: parseInt(normalized.slice(1, 3), 16),
        g: parseInt(normalized.slice(3, 5), 16),
        b: parseInt(normalized.slice(5, 7), 16),
    };
}

function toHexChannel(value) {
    return Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');
}

function mixChannels(source, target, targetWeight) {
    return {
        r: source.r + ((target.r - source.r) * targetWeight),
        g: source.g + ((target.g - source.g) * targetWeight),
        b: source.b + ((target.b - source.b) * targetWeight),
    };
}

function getThemedContrastColor(color) {
    const source = getColorChannels(color);
    if (!source) return '#FFFFFF';

    const yiq = ((source.r * 299) + (source.g * 587) + (source.b * 114)) / 1000;
    const target = yiq >= 128
        ? { r: 0, g: 0, b: 0 }
        : { r: 255, g: 255, b: 255 };
    const mixed = mixChannels(source, target, 0.72);

    return `#${toHexChannel(mixed.r)}${toHexChannel(mixed.g)}${toHexChannel(mixed.b)}`;
}

export function getSessionProgramDayId(session) {
    let programDayId = session?.program_day_id;

    if (!programDayId && session?.attributes) {
        try {
            const attributes = typeof session.attributes === 'string'
                ? JSON.parse(session.attributes)
                : session.attributes;
            programDayId = attributes?.program_context?.day_id;
        } catch {
            return null;
        }
    }

    return programDayId || null;
}

export function isCompletedSession(session) {
    return Boolean(session?.completed || session?.attributes?.completed);
}

const DAY_NAME_TO_INDEX = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
};

function getProgramDayTemplateKey(template) {
    return template?.id || null;
}

function getSessionTemplateKey(session) {
    return session?.template_id || null;
}

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

/** A definition's specific dates: its explicit schedule rows plus any legacy fixed date. */
export function getProgramDaySpecificDates(day) {
    const dates = [...(day?.scheduled_dates || []), day?.date]
        .map(getDatePart)
        .filter(Boolean);
    return [...new Set(dates)].sort();
}

function joinWithAnd(parts) {
    if (parts.length <= 1) return parts[0] || '';
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const formatShortDate = (value) => formatLiteralDate(value, { year: undefined });

/** "Every Monday, Wednesday and Friday in the block." */
export function formatWeekdaySchedule(weekdays = []) {
    const ordered = WEEKDAY_NAMES.filter((name) => weekdays.includes(name));
    if (!ordered.length) return '';
    if (ordered.length === 7) return 'Every day in the block.';
    return `Every ${joinWithAnd(ordered)} in the block.`;
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

export function getProgramDayTemplateRules(dayOrOccurrence) {
    const templates = dayOrOccurrence?.templates || dayOrOccurrence?.day?.templates || [];
    return templates
        .map((template, index) => ({
            template,
            templateKey: getProgramDayTemplateKey(template),
            isRequired: template?.is_required !== false,
            order: template?.order ?? index,
        }))
        .filter((rule) => Boolean(rule.templateKey))
        .sort((left, right) => left.order - right.order);
}

export function getProgramDayScheduledDates(day, block) {
    const blockStart = getDatePart(block?.start_date);
    const blockEnd = getDatePart(block?.end_date);
    const explicitDate = getDatePart(day?.date);

    if (explicitDate) {
        if (blockStart && blockEnd && (explicitDate < blockStart || explicitDate > blockEnd)) {
            return [];
        }
        return [explicitDate];
    }

    if (!blockStart || !blockEnd) {
        return [];
    }

    // Mirrors services/program_day_occurrences.program_day_scheduled_on: a reusable
    // definition occurs on its explicit schedule dates and its weekdays, within the block.
    const explicitScheduleDates = (day?.scheduled_dates || [])
        .map(getDatePart)
        .filter((dateStr) => dateStr && dateStr >= blockStart && dateStr <= blockEnd);
    const activeDays = getProgramDayWeekdayIndexes(day);
    const recurringDates = activeDays.length
        ? getRecurringDatesWithinRange(blockStart, blockEnd, activeDays)
        : [];

    return [...new Set([...explicitScheduleDates, ...recurringDates])].sort();
}

/**
 * @param {{ program?: any, blockFilter?: (block: any) => boolean, programIndex?: number }} [options]
 */
export function buildProgramDayOccurrences({
    program,
    blockFilter = () => true,
    programIndex = 0,
} = {}) {
    if (!program) {
        return [];
    }

    const programColor = getProgramColor(program, programIndex);

    return sortProgramBlocks(program.blocks || []).flatMap((block) => {
        if (!blockFilter(block)) {
            return [];
        }

        const blockColor = block.color || programColor;
        return (block.days || []).flatMap((day) => (
            getProgramDayScheduledDates(day, block).map((dateStr) => ({
                id: `${block.id}-${day.id}-${dateStr}`,
                date: dateStr,
                program,
                programId: program.id,
                block,
                blockId: block.id,
                blockName: block.name,
                blockColor,
                day,
                dayId: day.id,
                dayName: day.name || 'Program Day',
                templates: day.templates || [],
            }))
        ));
    });
}

export function getScheduledProgramDayCompletion(occurrence, sessions = [], timezone) {
    const occurrenceSessions = sessions.filter((session) => (
        getSessionProgramDayId(session) === occurrence.dayId
        && getISOYMDInTimezone(session.session_start || session.created_at, timezone) === occurrence.date
    ));
    const completedSessions = occurrenceSessions.filter(isCompletedSession);
    const templateRules = getProgramDayTemplateRules(occurrence);

    if (templateRules.length === 0) {
        return {
            isCompleted: false,
            sessions: occurrenceSessions,
            completedSessions,
        };
    }

    const completedTemplateKeys = new Set(
        completedSessions.map(getSessionTemplateKey).filter(Boolean)
    );
    const requiredTemplateKeys = templateRules
        .filter((rule) => rule.isRequired)
        .map((rule) => rule.templateKey);
    const completionMinTemplates = occurrence.day?.completion_min_templates ?? occurrence.completion_min_templates ?? null;
    const hasAnyCompletionRequirement = requiredTemplateKeys.length > 0 || completionMinTemplates;
    const requiredPassed = requiredTemplateKeys.every((templateKey) => completedTemplateKeys.has(templateKey));
    const minPassed = completionMinTemplates
        ? completedTemplateKeys.size >= completionMinTemplates
        : true;

    return {
        isCompleted: requiredPassed && minPassed && (hasAnyCompletionRequirement || completedTemplateKeys.size > 0),
        sessions: occurrenceSessions,
        completedSessions,
    };
}

export function flattenProgramSessions(program) {
    const sessionsById = new Map();

    (program?.blocks || []).forEach((block) => {
        (block.days || []).forEach((day) => {
            (day.sessions || []).forEach((session) => {
                if (session?.id && !sessionsById.has(session.id)) {
                    sessionsById.set(session.id, session);
                }
            });
        });
    });

    return Array.from(sessionsById.values());
}

export function buildProgramDaysMap(blocks = []) {
    const programDaysMap = new Map();

    blocks.forEach((block) => {
        (block.days || []).forEach((day) => {
            programDaysMap.set(day.id, {
                ...day,
                blockId: block.id,
                blockColor: block.color,
            });
        });
    });

    return programDaysMap;
}

export function sortProgramBlocks(blocks = []) {
    return [...blocks].sort((left, right) => {
        if (left.start_date && right.start_date) {
            return new Date(left.start_date).getTime() - new Date(right.start_date).getTime();
        }
        return 0;
    });
}

export function getProgramColor(program, index = 0) {
    if (program?.color) {
        return program.color;
    }
    const blockColor = (program?.blocks || []).find((block) => block.color)?.color;
    return blockColor || PROGRAM_COLORS[index % PROGRAM_COLORS.length];
}

/**
 * @param {{ program?: any, includeProgramId?: boolean, programIndex?: number }} [options]
 */
export function buildProgramBlockLabels({
    program,
    includeProgramId = false,
    programIndex = 0,
} = {}) {
    if (!program) {
        return [];
    }

    const programColor = getProgramColor(program, programIndex);

    return sortProgramBlocks(program.blocks || []).flatMap((block) => {
        const blockStart = getDatePart(block.start_date);
        const blockEnd = getDatePart(block.end_date);
        if (!blockStart || !blockEnd) {
            return [];
        }

        const blockColor = block.color || programColor;
        return [{
            id: `block-label-${includeProgramId ? `${program.id}-` : ''}${block.id}`,
            title: block.name,
            date: blockStart,
            startDate: blockStart,
            endDate: blockEnd,
            programId: program.id,
            blockId: block.id,
            blockColor,
            color: getThemedContrastColor(blockColor),
        }];
    });
}

/** Calendar labels for each program, using summary data only. */
export function buildProgramSummaryLabels(programs = []) {
    return programs.flatMap((program, programIndex) => {
        const date = getDatePart(program?.start_date);
        if (!date || !program?.id || !program?.name) return [];
        const color = getProgramColor(program, programIndex);
        return [{
            id: `program-label-${program.id}`,
            title: program.name,
            date,
            startDate: date,
            endDate: getDatePart(program.end_date) || date,
            programId: program.id,
            labelType: 'program',
            color: getThemedContrastColor(color),
        }];
    });
}

export function getProgramGoalIds(program) {
    return new Set([
        ...(program?.goal_ids || []),
        ...(program?.selected_goals || []),
        ...(program?.blocks || []).flatMap((block) => block.goal_ids || []),
    ]);
}

/**
 * @param {object} options
 * @param {any} options.program
 * @param {any[]} [options.goals]
 * @param {any[]} [options.sessions]
 * @param {string} [options.timezone] IANA zone; omitted means the viewer's local zone.
 * @param {Function} options.getGoalColor
 * @param {Function} options.getGoalTextColor
 * @param {Function} options.getGoalSecondaryColor
 * @param {Function} options.getGoalIcon
 * @param {Set<string>} [options.attachedGoalIds] Defaults to the program's own goals.
 * @param {boolean} [options.includeProgramId]
 * @param {number} [options.programIndex]
 */
export function buildProgramCalendarEvents({
    program,
    goals = [],
    sessions = [],
    timezone,
    getGoalColor,
    getGoalTextColor,
    getGoalSecondaryColor,
    getGoalIcon,
    attachedGoalIds,
    includeProgramId = false,
    programIndex = 0,
}) {
    if (!program) {
        return [];
    }

    const events = [];
    const dateGroups = {};
    const blocks = program.blocks || [];
    const sortedBlocks = sortProgramBlocks(blocks);
    const programDaysMap = buildProgramDaysMap(blocks);
    const goalById = new Map(goals.map((goal) => [goal.id, goal]));
    const goalIds = attachedGoalIds || getProgramGoalIds(program);
    const programColor = getProgramColor(program, programIndex);

    const addDayToDateGroup = (dateStr, day, block) => {
        if (!dateStr) {
            return;
        }
        if (!dateGroups[dateStr]) {
            dateGroups[dateStr] = { groupsByDay: {}, unlinkedSessions: [] };
        }

        const name = day.name || 'Program Day';
        const dayKey = day.id || `name:${name}`;
        if (!dateGroups[dateStr].groupsByDay[dayKey]) {
            dateGroups[dateStr].groupsByDay[dayKey] = {
                name,
                pDay: day,
                blockColor: block.color || programColor,
                sessions: [],
                templatesByName: {},
            };
        }

        const group = dateGroups[dateStr].groupsByDay[dayKey];
        (day.templates || []).forEach((template) => {
            if (!group.templatesByName[template.name]) {
                group.templatesByName[template.name] = { templates: [], sessions: [] };
            }
            if (!group.templatesByName[template.name].templates.some((existing) => existing.id === template.id)) {
                group.templatesByName[template.name].templates.push(template);
            }
        });
    };

    const occurrences = buildProgramDayOccurrences({ program, programIndex });

    sortedBlocks.forEach((block) => {
        const blockStart = getDatePart(block.start_date);
        const blockEnd = getDatePart(block.end_date);

        if (blockStart && blockEnd) {
            const blockColor = block.color || programColor;

            events.push({
                id: `block-bg-${includeProgramId ? `${program.id}-` : ''}${block.id}`,
                title: '',
                start: blockStart,
                end: addDaysToDateString(blockEnd, 1),
                backgroundColor: blockColor,
                borderColor: blockColor,
                textColor: 'white',
                allDay: true,
                display: 'background',
                sortOrder: -10,
                extendedProps: {
                    type: 'block_background',
                    blockColor,
                    programId: program.id,
                    program,
                    sortOrder: -10,
                    ...block,
                },
            });
        }
    });

    occurrences.forEach((occurrence) => {
        addDayToDateGroup(occurrence.date, occurrence.day, occurrence.block);
    });

    sessions.forEach((session) => {
        const dateStr = getISOYMDInTimezone(session.session_start || session.created_at, timezone);
        if (!dateStr) {
            return;
        }
        if (!dateGroups[dateStr]) {
            dateGroups[dateStr] = { groupsByDay: {}, unlinkedSessions: [] };
        }

        const programDayId = getSessionProgramDayId(session);
        const programDay = programDayId ? programDaysMap.get(programDayId) : null;

        if (programDay) {
            const name = programDay.name || 'Program Day';
            const dayKey = programDay.id || `name:${name}`;
            if (!dateGroups[dateStr].groupsByDay[dayKey]) {
                const owningBlock = blocks.find((block) =>
                    (block.days || []).some((day) => day.id === programDayId)
                );
                const sessionInBlockRange = owningBlock
                    ? dateStr >= getDatePart(owningBlock.start_date) && dateStr <= getDatePart(owningBlock.end_date)
                    : false;

                dateGroups[dateStr].groupsByDay[dayKey] = {
                    name,
                    pDay: programDay,
                    blockColor: sessionInBlockRange ? programDay.blockColor : null,
                    sessions: [],
                    templatesByName: {},
                };
                (programDay.templates || []).forEach((template) => {
                    if (!dateGroups[dateStr].groupsByDay[dayKey].templatesByName[template.name]) {
                        dateGroups[dateStr].groupsByDay[dayKey].templatesByName[template.name] = { templates: [], sessions: [] };
                    }
                    dateGroups[dateStr].groupsByDay[dayKey].templatesByName[template.name].templates.push(template);
                });
            }

            dateGroups[dateStr].groupsByDay[dayKey].sessions.push(session);
            return;
        }

        let claimed = false;
        for (const group of Object.values(dateGroups[dateStr].groupsByDay)) {
            if (group.templatesByName[session.name]) {
                group.sessions.push(session);
                claimed = true;
                break;
            }
        }

        if (!claimed) {
            dateGroups[dateStr].unlinkedSessions.push(session);
        }
    });

    Object.entries(dateGroups).forEach(([dateStr, data]) => {
        Object.values(data.groupsByDay).forEach((group) => {
            group.sessions.forEach((session) => {
                const templateGroup = group.templatesByName[session.name];
                if (templateGroup) {
                    templateGroup.sessions.push(session);
                    return;
                }

                const matchingTemplate = Object.values(group.templatesByName)
                    .flatMap((templateEntry) => templateEntry.templates)
                    .find((template) => template.id === session.template_id);

                if (matchingTemplate) {
                    group.templatesByName[matchingTemplate.name].sessions.push(session);
                }
            });

            const templatePairs = Object.values(group.templatesByName);
            const isProgramDayCompleted = group.pDay
                ? getScheduledProgramDayCompletion({
                    dayId: group.pDay.id,
                    date: dateStr,
                    day: group.pDay,
                }, sessions, timezone).isCompleted
                : false;
            events.push({
                id: `pday-${includeProgramId ? `${program.id}-` : ''}${dateStr}-${group.pDay?.id || group.name}`,
                title: group.name,
                start: dateStr,
                allDay: true,
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                textColor: 'inherit',
                classNames: ['program-day-event'],
                extendedProps: {
                    type: 'program_day',
                    programId: program.id,
                    program,
                    pDayId: group.pDay?.id,
                    blockColor: group.blockColor || null,
                    isCompleted: isProgramDayCompleted,
                    sortOrder: 0,
                },
            });

            templatePairs.forEach((pair) => {
                const templateName = pair.templates[0]?.name || 'Untitled Template';
                const completedSessions = pair.sessions.filter(isCompletedSession);
                const completedCount = completedSessions.length;
                const isTemplateCompleted = completedCount > 0;
                let title = templateName;

                if (isTemplateCompleted) {
                    title = templateName;
                    if (completedCount > 1) {
                        title += ` (${completedCount})`;
                    }
                }

                if (!includeProgramId) {
                    events.push({
                        id: `template-${dateStr}-${group.name}-${templateName}`,
                        title,
                        start: dateStr,
                        allDay: true,
                        backgroundColor: 'transparent',
                        borderColor: 'transparent',
                        textColor: 'inherit',
                        classNames: ['template-event'],
                        extendedProps: {
                            type: 'template',
                            templateId: pair.templates[0]?.id,
                            isCompleted: isTemplateCompleted,
                            count: completedCount,
                            sortOrder: 1,
                        },
                    });
                }
            });
        });

        data.unlinkedSessions.forEach((session) => {
            const completed = isCompletedSession(session);
            events.push({
                id: `session-${includeProgramId ? `${program.id}-` : ''}${session.id}`,
                title: session.name,
                start: dateStr,
                allDay: true,
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                textColor: 'inherit',
                extendedProps: {
                    type: 'session',
                    programId: program.id,
                    program,
                    sortOrder: 2,
                    isCompleted: completed,
                    ...session,
                },
            });
        });
    });

    goalIds.forEach((goalId) => {
        const goal = goalById.get(goalId);
        const event = buildGoalDeadlineCalendarEvent({
            goal,
            timezone,
            idPrefix: includeProgramId ? `program-goal-${program.id}` : 'goal',
            useCompletionDate: !includeProgramId,
            getGoalColor,
            getGoalTextColor,
            getGoalSecondaryColor,
            getGoalIcon,
            extendedProps: { programId: program.id, program },
        });
        if (event) events.push(event);
    });

    return events;
}

export function buildProgramsCalendarEvents(programs = [], goals = [], getGoalColor, getGoalTextColor, timezone, goalIconHelpers = {}, detailedProgram = undefined) {
    const events = [];
    const goalEventIds = new Set();

    programs.forEach((program, programIndex) => {
        const programStart = getDatePart(program.start_date);
        const programEnd = getDatePart(program.end_date);
        const programColor = getProgramColor(program, programIndex);

        if (programStart && programEnd) {
            events.push({
                id: `program-bg-${program.id}`,
                title: '',
                start: programStart,
                end: addDaysToDateString(programEnd, 1),
                backgroundColor: programColor,
                borderColor: programColor,
                display: 'background',
                allDay: true,
                extendedProps: {
                    type: 'program_background',
                    programId: program.id,
                    program,
                    sortOrder: -20,
                },
            });
        }

        const detail = detailedProgram === undefined
            ? program
            : (String(detailedProgram?.id) === String(program.id) ? detailedProgram : null);
        const programEvents = detail ? buildProgramCalendarEvents({
            program: detail,
            goals,
            sessions: flattenProgramSessions(detail),
            timezone,
            getGoalColor,
            getGoalTextColor,
            getGoalSecondaryColor: goalIconHelpers.getGoalSecondaryColor,
            getGoalIcon: goalIconHelpers.getGoalIcon,
            includeProgramId: true,
            programIndex,
        }) : [];

        programEvents.forEach((event) => {
            if (event.extendedProps?.type === 'goal' && event.extendedProps?.id) {
                if (goalEventIds.has(event.extendedProps.id)) {
                    return;
                }
                goalEventIds.add(event.extendedProps.id);
            }
            events.push(event);
        });
    });

    goals.forEach((goal) => {
        if (goalEventIds.has(goal.id)) {
            return;
        }

        const event = buildGoalDeadlineCalendarEvent({
            goal,
            timezone,
            getGoalColor,
            getGoalTextColor,
            ...goalIconHelpers,
        });
        if (event) {
            events.push(event);
        }
    });

    return events;
}

function getDaysBetween(dateValue, targetValue) {
    const start = new Date(`${getDatePart(dateValue)}T00:00:00`);
    const target = new Date(`${getDatePart(targetValue)}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(target.getTime())) {
        return null;
    }
    return Math.ceil((target.getTime() - start.getTime()) / 86400000);
}

/** @param {{ program: any, sessions?: any[], programDaysMap: Map<string, any>, attachedGoalIds?: Set<string>, getGoalDetails: (goalId: string) => any, timezone?: string }} options Omitted timezone means the viewer's local zone. */
export function buildDemoProgramMetrics({ program, sessions = [], programDaysMap, attachedGoalIds, getGoalDetails, timezone }) {
    if (!program) {
        return null;
    }

    const scopedProgramDaysMap = programDaysMap || buildProgramDaysMap(program.blocks || []);
    const scheduledProgramDays = buildProgramDayOccurrences({ program });
    const completedProgramDays = scheduledProgramDays.filter((occurrence) => (
        getScheduledProgramDayCompletion(occurrence, sessions, timezone).isCompleted
    ));
    const programSessions = sessions.filter((session) => {
        const programDayId = getSessionProgramDayId(session);
        return programDayId && scopedProgramDaysMap.has(programDayId);
    });

    const today = new Date().toISOString().slice(0, 10);
    const startsInDays = getDatePart(program.start_date) > today
        ? getDaysBetween(today, program.start_date)
        : null;

    return {
        completedSessions: completedProgramDays.length,
        scheduledSessions: scheduledProgramDays.length,
        completedProgramDays: completedProgramDays.length,
        scheduledProgramDays: scheduledProgramDays.length,
        totalDuration: programSessions.reduce((sum, session) => sum + (session.total_duration_seconds || 0), 0),
        goalsMet: Array.from(attachedGoalIds || []).filter((goalId) => {
            const goal = getGoalDetails(goalId);
            return goal && (goal.completed || goal.attributes?.completed);
        }).length,
        totalGoals: attachedGoalIds?.size || 0,
        daysRemaining: getDaysRemaining(program.end_date),
        startsInDays,
        primaryMetricLabel: startsInDays !== null ? 'Days Until Program Start' : 'Days Remaining',
        primaryMetricValue: startsInDays !== null ? startsInDays : getDaysRemaining(program.end_date),
    };
}

export function buildBlockGoalsByBlockId({ sortedBlocks = [], associatedGoals = [] }) {
    /** @type {Array<[string, any[]]>} */
    const entries = sortedBlocks.map((block) => {
        const seenGoalIds = new Set();
        const blockGoals = associatedGoals
            .filter((goal) => isGoalAssociatedWithBlock(goal, block))
            .filter((goal) => {
                if (!goal || seenGoalIds.has(goal.id)) {
                    return false;
                }
                seenGoalIds.add(goal.id);
                return true;
            })
            .sort((left, right) => {
                const leftDeadline = getGoalDeadline(left);
                const rightDeadline = getGoalDeadline(right);

                if (leftDeadline && rightDeadline) {
                    return new Date(leftDeadline).getTime() - new Date(rightDeadline).getTime();
                }
                if (leftDeadline) {
                    return -1;
                }
                if (rightDeadline) {
                    return 1;
                }
                return left.name.localeCompare(right.name);
            });

        return [block.id, blockGoals];
    });

    return new Map(entries);
}

/** @param {{ activeBlock: any, sessions?: any[], program: any, programDaysMap: Map<string, any>, blockGoalsByBlockId: Map<string, any[]>, timezone?: string }} options Omitted timezone means the viewer's local zone. */
export function buildBlockMetrics({ activeBlock, sessions = [], program, programDaysMap, blockGoalsByBlockId, timezone }) {
    if (!activeBlock) {
        return null;
    }

    const scheduledProgramDays = buildProgramDayOccurrences({
        program,
        blockFilter: (block) => block.id === activeBlock.id,
    });
    const completedProgramDays = scheduledProgramDays.filter((occurrence) => (
        getScheduledProgramDayCompletion(occurrence, sessions, timezone).isCompleted
    ));
    const blockSessions = sessions.filter((session) => {
        const programDayId = getSessionProgramDayId(session);
        if (!programDayId) {
            return false;
        }

        return programDaysMap.get(programDayId)?.blockId === activeBlock.id;
    });

    const blockGoals = blockGoalsByBlockId.get(activeBlock.id) || [];

    return {
        name: activeBlock.name,
        color: activeBlock.color || '#3A86FF',
        completedSessions: completedProgramDays.length,
        scheduledSessions: scheduledProgramDays.length,
        completedProgramDays: completedProgramDays.length,
        scheduledProgramDays: scheduledProgramDays.length,
        goalsMet: blockGoals.filter((goal) => goal && (goal.completed || goal.attributes?.completed)).length,
        totalGoals: blockGoals.length,
        totalDuration: blockSessions.reduce((sum, session) => sum + (session.total_duration_seconds || 0), 0),
        daysRemaining: getDaysRemaining(activeBlock.end_date),
    };
}

export function buildProgramSidePaneData({ program, goals = [], attachedGoalIds, getGoalDetails }) {
    if (!program) {
        return {
            programMetrics: null,
            activeBlock: null,
            blockMetrics: null,
            programGoalSeeds: [],
        };
    }

    const goalScope = buildProgramGoalScope({ program, goals, getGoalDetails });
    const goalById = goalScope.goalById;
    const programGoalSeeds = goalScope.hierarchyGoalSeeds;
    const scopedAttachedGoalIds = attachedGoalIds || new Set([
        ...goalScope.expandAssociatedGoalIds(program.goal_ids || []),
        ...(program.blocks || []).flatMap((block) => block.goal_ids || []),
    ]);
    const sessions = flattenProgramSessions(program);
    const programDaysMap = buildProgramDaysMap(program.blocks || []);
    const activeBlock = (program.blocks || []).find((block) => isBlockActive(block)) || null;
    const associatedGoals = Array.from(scopedAttachedGoalIds)
        .map((goalId) => getGoalDetails?.(goalId) || goalById.get(goalId))
        .filter(Boolean);
    const blockGoalsByBlockId = buildBlockGoalsByBlockId({
        sortedBlocks: sortProgramBlocks(program.blocks || []),
        associatedGoals,
    });

    return {
        programMetrics: buildDemoProgramMetrics({
            program,
            sessions,
            programDaysMap,
            attachedGoalIds: scopedAttachedGoalIds,
            getGoalDetails: (goalId) => getGoalDetails?.(goalId) || goalById.get(goalId) || null,
        }),
        activeBlock,
        blockMetrics: buildBlockMetrics({
            activeBlock,
            sessions,
            program,
            programDaysMap,
            blockGoalsByBlockId,
        }),
        programGoalSeeds,
    };
}
