import {
    addDaysToDateString,
    getDatePart,
    getDaysRemaining,
    getISOYMDInTimezone,
    getRecurringDatesWithinRange,
} from './dateUtils';
import { getGoalDeadline, isGoalAssociatedWithBlock } from './programGoalAssociations';
import { isBlockActive } from './programUtils.jsx';

const PROGRAM_COLORS = ['#3A86FF', '#06A77D', '#FFBE0B', '#EF476F', '#7B5CFF', '#4ECDC4'];

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
            return new Date(left.start_date) - new Date(right.start_date);
        }
        return 0;
    });
}

export function getProgramColor(program, index = 0) {
    const blockColor = (program?.blocks || []).find((block) => block.color)?.color;
    return blockColor || PROGRAM_COLORS[index % PROGRAM_COLORS.length];
}

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

export function getProgramGoalIds(program) {
    return new Set([
        ...(program?.goal_ids || []),
        ...(program?.selected_goals || []),
        ...(program?.blocks || []).flatMap((block) => block.goal_ids || []),
    ]);
}

export function buildProgramCalendarEvents({
    program,
    goals = [],
    sessions = [],
    timezone,
    getGoalColor,
    getGoalTextColor,
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
            dateGroups[dateStr] = { groupsByName: {}, unlinkedSessions: [] };
        }

        const name = day.name || 'Program Day';
        if (!dateGroups[dateStr].groupsByName[name]) {
            dateGroups[dateStr].groupsByName[name] = {
                name,
                pDay: day,
                blockColor: block.color || programColor,
                sessions: [],
                templatesByName: {},
            };
        }

        const group = dateGroups[dateStr].groupsByName[name];
        (day.templates || []).forEach((template) => {
            if (!group.templatesByName[template.name]) {
                group.templatesByName[template.name] = { templates: [], sessions: [] };
            }
            if (!group.templatesByName[template.name].templates.some((existing) => existing.id === template.id)) {
                group.templatesByName[template.name].templates.push(template);
            }
        });
    };

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

        (block.days || []).forEach((day) => {
            if (day.date) {
                addDayToDateGroup(getDatePart(day.date), day, block);
            }

            if (day.day_of_week?.length && blockStart && blockEnd) {
                const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
                const activeDays = [...new Set((Array.isArray(day.day_of_week) ? day.day_of_week : [day.day_of_week])
                    .map((dayName) => dayMap[dayName])
                    .filter((value) => value !== undefined))];

                getRecurringDatesWithinRange(blockStart, blockEnd, activeDays).forEach((dateStr) => {
                    addDayToDateGroup(dateStr, day, block);
                });
            }
        });
    });

    sessions.forEach((session) => {
        const dateStr = getISOYMDInTimezone(session.session_start || session.created_at, timezone);
        if (!dateStr) {
            return;
        }
        if (!dateGroups[dateStr]) {
            dateGroups[dateStr] = { groupsByName: {}, unlinkedSessions: [] };
        }

        const programDayId = getSessionProgramDayId(session);
        const programDay = programDayId ? programDaysMap.get(programDayId) : null;

        if (programDay) {
            const name = programDay.name || 'Program Day';
            if (!dateGroups[dateStr].groupsByName[name]) {
                const owningBlock = blocks.find((block) =>
                    (block.days || []).some((day) => day.id === programDayId)
                );
                const sessionInBlockRange = owningBlock
                    ? dateStr >= getDatePart(owningBlock.start_date) && dateStr <= getDatePart(owningBlock.end_date)
                    : false;

                dateGroups[dateStr].groupsByName[name] = {
                    name,
                    pDay: programDay,
                    blockColor: sessionInBlockRange ? programDay.blockColor : null,
                    sessions: [],
                    templatesByName: {},
                };
                (programDay.templates || []).forEach((template) => {
                    if (!dateGroups[dateStr].groupsByName[name].templatesByName[template.name]) {
                        dateGroups[dateStr].groupsByName[name].templatesByName[template.name] = { templates: [], sessions: [] };
                    }
                    dateGroups[dateStr].groupsByName[name].templatesByName[template.name].templates.push(template);
                });
            }

            dateGroups[dateStr].groupsByName[name].sessions.push(session);
            return;
        }

        let claimed = false;
        for (const group of Object.values(dateGroups[dateStr].groupsByName)) {
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
        Object.values(data.groupsByName).forEach((group) => {
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
            const isProgramDayCompleted = templatePairs.length > 0
                && templatePairs.every((pair) => pair.sessions.some(isCompletedSession));

            events.push({
                id: `pday-${includeProgramId ? `${program.id}-` : ''}${dateStr}-${group.pDay?.id || group.name}`,
                title: `${isProgramDayCompleted ? '✓ ' : ''}${group.name}`,
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
                    title = `✓ ${templateName}`;
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
                title: `${completed ? '✓ ' : ''}${session.name}`,
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
        const deadline = goal ? getGoalDeadline(goal) : null;
        if (!goal || !deadline) {
            return;
        }

        const goalType = goal.attributes?.type || goal.type;
        const completed = goal.completed || goal.attributes?.completed;
        const completionDate = goal.completed_at || goal.attributes?.completed_at;
        const color = getGoalColor(goalType);
        events.push({
            id: `${includeProgramId ? `program-goal-${program.id}` : 'goal'}-${goal.id}`,
            title: `${completed ? '✓ ' : ''}${goal.name}`,
            start: !includeProgramId && completed && completionDate
                ? getISOYMDInTimezone(completionDate, timezone)
                : getDatePart(deadline),
            allDay: true,
            backgroundColor: color,
            borderColor: color,
            textColor: getGoalTextColor(goalType),
            extendedProps: {
                type: 'goal',
                programId: program.id,
                program,
                sortOrder: 3,
                ...goal,
            },
            classNames: completed ? ['completed-goal-event', 'clickable-goal-event'] : ['clickable-goal-event'],
        });
    });

    return events;
}

function buildGoalDeadlineEvent(goal, getGoalColor, getGoalTextColor, timezone, idPrefix = 'calendar-goal') {
    const deadline = getGoalDeadline(goal);
    if (!goal || !deadline) {
        return null;
    }

    const goalType = goal.attributes?.type || goal.type;
    const completed = goal.completed || goal.attributes?.completed;
    const completionDate = goal.completed_at || goal.attributes?.completed_at;
    const color = getGoalColor(goalType);

    return {
        id: `${idPrefix}-${goal.id}`,
        title: `${completed ? '✓ ' : ''}${goal.name}`,
        start: completed && completionDate
            ? getISOYMDInTimezone(completionDate, timezone)
            : getDatePart(deadline),
        allDay: true,
        backgroundColor: color,
        borderColor: color,
        textColor: getGoalTextColor(goalType),
        extendedProps: {
            type: 'goal',
            id: goal.id,
            goalId: goal.id,
            sortOrder: 3,
            ...goal,
        },
        classNames: completed ? ['completed-goal-event', 'clickable-goal-event'] : ['clickable-goal-event'],
    };
}

export function buildProgramsCalendarEvents(programs = [], goals = [], getGoalColor, getGoalTextColor, timezone) {
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

        const programEvents = buildProgramCalendarEvents({
            program,
            goals,
            sessions: flattenProgramSessions(program),
            timezone,
            getGoalColor,
            getGoalTextColor,
            includeProgramId: true,
            programIndex,
        });

        programEvents.forEach((event) => {
            if (event.extendedProps?.type === 'goal' && event.extendedProps?.id) {
                goalEventIds.add(event.extendedProps.id);
            }
            events.push(event);
        });
    });

    goals.forEach((goal) => {
        if (goalEventIds.has(goal.id)) {
            return;
        }

        const event = buildGoalDeadlineEvent(goal, getGoalColor, getGoalTextColor, timezone);
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

export function buildProgramMetrics({ program, sessions = [], programDaysMap, attachedGoalIds, getGoalDetails }) {
    if (!program) {
        return null;
    }

    const scopedProgramDaysMap = programDaysMap || buildProgramDaysMap(program.blocks || []);
    const programSessions = sessions.filter((session) => {
        const programDayId = getSessionProgramDayId(session);
        return programDayId && scopedProgramDaysMap.has(programDayId);
    });

    const today = new Date().toISOString().slice(0, 10);
    const startsInDays = getDatePart(program.start_date) > today
        ? getDaysBetween(today, program.start_date)
        : null;

    return {
        completedSessions: programSessions.filter(isCompletedSession).length,
        scheduledSessions: Array.from(scopedProgramDaysMap.values()).reduce((sum, day) => sum + (day.templates?.length || 0), 0),
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
                    return new Date(leftDeadline) - new Date(rightDeadline);
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

export function buildBlockMetrics({ activeBlock, sessions = [], programDaysMap, blockGoalsByBlockId }) {
    if (!activeBlock) {
        return null;
    }

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
        completedSessions: blockSessions.filter(isCompletedSession).length,
        scheduledSessions: blockSessions.length,
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

    const goalById = new Map(goals.map((goal) => [goal.id, goal]));
    const programGoalSeeds = (program.goal_ids || [])
        .map((goalId) => goalById.get(goalId))
        .filter(Boolean);
    const sessions = flattenProgramSessions(program);
    const programDaysMap = buildProgramDaysMap(program.blocks || []);
    const activeBlock = (program.blocks || []).find((block) => isBlockActive(block)) || null;
    const associatedGoals = Array.from(attachedGoalIds || getProgramGoalIds(program))
        .map((goalId) => getGoalDetails?.(goalId) || goalById.get(goalId))
        .filter(Boolean);
    const blockGoalsByBlockId = buildBlockGoalsByBlockId({
        sortedBlocks: sortProgramBlocks(program.blocks || []),
        associatedGoals,
    });

    return {
        programMetrics: buildProgramMetrics({
            program,
            sessions,
            programDaysMap,
            attachedGoalIds: attachedGoalIds || getProgramGoalIds(program),
            getGoalDetails: (goalId) => getGoalDetails?.(goalId) || goalById.get(goalId) || null,
        }),
        activeBlock,
        blockMetrics: buildBlockMetrics({
            activeBlock,
            sessions,
            programDaysMap,
            blockGoalsByBlockId,
        }),
        programGoalSeeds,
    };
}
