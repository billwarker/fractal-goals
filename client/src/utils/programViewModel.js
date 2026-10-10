import {
    addDaysToDateString,
    getDatePart,
    getDaysRemaining,
    getISOYMDInTimezone,
} from './dateUtils';
import { buildGoalDeadlineCalendarEvent } from './programCalendarGoalEvents';
import { trackedBlockWeeks } from './programBlockWeeks';
import { buildProgramGoalScope } from './programGoalWindow';
import { isBlockActive } from './programUtils.jsx';
import { getProgramDayScheduledDates } from './programDaySchedule';

export { WEEKDAY_NAMES, getProgramDayWeekdays, getProgramDaySpecificDates, formatWeekdaySchedule,
    formatSpecificDatesSummary, getProgramDayScheduleLabel, getProgramDayScheduledDates } from './programDaySchedule';

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

function getProgramDayTemplateKey(template) {
    return template?.id || null;
}

function getSessionTemplateKey(session) {
    return session?.template_id || null;
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

/** The block covering ``dateStr`` (blocks never overlap), or ``null``. */
export function blockForDate(blocks = [], dateStr) {
    if (!dateStr) return null;
    return (blocks || []).find((block) => {
        const blockStart = getDatePart(block?.start_date);
        const blockEnd = getDatePart(block?.end_date);
        return Boolean(blockStart && blockEnd && blockStart <= dateStr && dateStr <= blockEnd);
    }) || null;
}

/**
 * A program's days. Program days belong to the program; landing snapshots published before
 * that change still nest them under blocks, so those are read from there.
 */
export function getProgramDays(program) {
    if (Array.isArray(program?.days)) return program.days;
    return (program?.blocks || []).flatMap((block) => block?.days || []);
}

/** The program's days in sidebar order. */
export function sortProgramDays(days = []) {
    return [...(days || [])].sort((left, right) => (
        (left.day_number ?? Number.MAX_SAFE_INTEGER) - (right.day_number ?? Number.MAX_SAFE_INTEGER)
        || String(left.name || '').localeCompare(String(right.name || ''))
    ));
}

/**
 * Every scheduled program-day date, each with the block covering it (``null`` outside blocks).
 * @param {{ program?: any, blockFilter?: (block: any) => boolean, programIndex?: number }} [options]
 */
export function buildProgramDayOccurrences({
    program,
    blockFilter = null,
    programIndex = 0,
} = {}) {
    if (!program) {
        return [];
    }

    const programColor = getProgramColor(program, programIndex);
    const blocks = program.blocks || [];

    return sortProgramDays(getProgramDays(program)).flatMap((day) => (
        getProgramDayScheduledDates(day, program).flatMap((dateStr) => {
            const block = blockForDate(blocks, dateStr);
            if (blockFilter && !(block && blockFilter(block))) {
                return [];
            }
            return [{
                id: `${day.id}-${dateStr}`,
                date: dateStr,
                program,
                programId: program.id,
                block,
                blockId: block?.id ?? null,
                blockName: block?.name ?? null,
                blockColor: block?.color || programColor,
                day,
                dayId: day.id,
                dayName: day.name || 'Program Day',
                templates: day.templates || [],
            }];
        })
    )).sort((left, right) => left.date.localeCompare(right.date));
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

    getProgramDays(program).forEach((day) => {
        (day.sessions || []).forEach((session) => {
            if (session?.id && !sessionsById.has(session.id)) {
                sessionsById.set(session.id, session);
            }
        });
    });

    return Array.from(sessionsById.values());
}

export function buildProgramDaysMap(program) {
    return new Map(getProgramDays(program).map((day) => [day.id, day]));
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
        const color = getThemedContrastColor(blockColor);
        const idPrefix = `${includeProgramId ? `${program.id}-` : ''}${block.id}`;
        // Tracked weeks: Week 1 rides on the block label; each later week gets its own chip.
        const weeks = trackedBlockWeeks(block);
        const weekTitle = (week) => `${block.name}, week ${week.index} of ${weeks.length}`;
        return [{
            id: `block-label-${idPrefix}`,
            title: block.name,
            date: blockStart,
            startDate: blockStart,
            endDate: blockEnd,
            programId: program.id,
            blockId: block.id,
            blockColor,
            color,
            weekChip: weeks.length ? 'W1' : null,
            weekTitle: weeks.length ? weekTitle(weeks[0]) : null,
        }, ...weeks.slice(1).map((week) => ({
            id: `week-label-${idPrefix}-${week.index}`,
            labelType: 'week',
            title: `W${week.index}`,
            weekTitle: weekTitle(week),
            date: week.start,
            startDate: week.start,
            endDate: week.end,
            programId: program.id,
            blockId: block.id,
            blockColor,
            color,
        }))];
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
    const programDaysMap = buildProgramDaysMap(program);
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
                blockColor: block?.color || programColor,
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
                dateGroups[dateStr].groupsByDay[dayKey] = {
                    name,
                    pDay: programDay,
                    blockColor: blockForDate(blocks, dateStr)?.color || null,
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
    const hasCalendarProjection = detailedProgram !== undefined;

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

        if (hasCalendarProjection) {
            const programColor = getProgramColor(program, programIndex);
            const projectedBlocks = program.blocks || (
                String(detailedProgram?.id) === String(program.id) ? detailedProgram.blocks : []
            );
            (projectedBlocks || []).forEach((block) => {
                const blockStart = getDatePart(block.start_date);
                const blockEnd = getDatePart(block.end_date);
                if (!blockStart || !blockEnd) return;
                const blockColor = block.color || programColor;
                events.push({
                    id: `block-bg-${program.id}-${block.id}`,
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
            if (hasCalendarProjection && event.extendedProps?.type === 'block_background') {
                return;
            }
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

    const scopedProgramDaysMap = programDaysMap || buildProgramDaysMap(program);
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

/** @param {{ activeBlock: any, sessions?: any[], program: any, programDaysMap: Map<string, any>, programGoalIds?: Iterable<string>, getGoalDetails?: (goalId: string) => any, timezone?: string }} options Omitted timezone means the viewer's local zone. */
export function buildBlockMetrics({ activeBlock, sessions = [], program, programDaysMap, programGoalIds = [], getGoalDetails = () => null, timezone }) {
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
    // Program days span blocks, so a session belongs to the block covering its date.
    const blockStart = getDatePart(activeBlock.start_date);
    const blockEnd = getDatePart(activeBlock.end_date);
    const blockSessions = sessions.filter((session) => {
        const programDayId = getSessionProgramDayId(session);
        if (!programDayId || !programDaysMap.has(programDayId)) {
            return false;
        }
        const sessionDate = getISOYMDInTimezone(session.session_start || session.created_at, timezone);
        return Boolean(sessionDate && blockStart && blockEnd && blockStart <= sessionDate && sessionDate <= blockEnd);
    });

    // A block's goals are the program goals due inside it.
    const blockGoals = [...programGoalIds].map((goalId) => getGoalDetails(goalId)).filter((goal) => {
        const deadline = String(goal?.deadline || goal?.attributes?.deadline || '').slice(0, 10);
        return Boolean(deadline && blockStart && deadline >= blockStart && deadline <= blockEnd);
    });

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
    ]);
    const sessions = flattenProgramSessions(program);
    const programDaysMap = buildProgramDaysMap(program);
    const activeBlock = (program.blocks || []).find((block) => isBlockActive(block)) || null;
    const resolveGoal = (goalId) => getGoalDetails?.(goalId) || goalById.get(goalId) || null;

    return {
        programMetrics: buildDemoProgramMetrics({
            program,
            sessions,
            programDaysMap,
            attachedGoalIds: scopedAttachedGoalIds,
            getGoalDetails: resolveGoal,
        }),
        activeBlock,
        blockMetrics: buildBlockMetrics({
            activeBlock,
            sessions,
            program,
            programDaysMap,
            programGoalIds: scopedAttachedGoalIds,
            getGoalDetails: resolveGoal,
        }),
        programGoalSeeds,
    };
}
