import { useMemo } from 'react';
import moment from 'moment';

import { getDatePart, getISOYMDInTimezone } from '../utils/dateUtils';
import { getGoalDeadline, isGoalAssociatedWithBlock } from '../utils/programGoalAssociations';
import { isBlockActive } from '../utils/programUtils.jsx';

function getSessionProgramDayId(session) {
    let programDayId = session.program_day_id;

    if (!programDayId && session.attributes) {
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

function isCompletedSession(session) {
    return Boolean(session.completed || session.attributes?.completed);
}

function buildProgramDaysMap(blocks = []) {
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

export function useProgramDetailViewModel({
    program,
    goals = [],
    sessions = [],
    timezone,
    getGoalColor,
    getGoalTextColor,
    getGoalDetails,
    attachBlockId,
    attachedGoalIds,
    hierarchyGoalSeeds,
}) {
    const sortedBlocks = useMemo(() => {
        return [...(program?.blocks || [])].sort((left, right) => {
            if (left.start_date && right.start_date) {
                return new Date(left.start_date) - new Date(right.start_date);
            }
            return 0;
        });
    }, [program?.blocks]);

    const programDaysMap = useMemo(() => buildProgramDaysMap(program?.blocks || []), [program?.blocks]);

    const calendarEvents = useMemo(() => {
        if (!program) {
            return [];
        }

        const events = [];
        const dateGroups = {};

        const addDayToDateGroup = (dateStr, day, block) => {
            if (!dateGroups[dateStr]) {
                dateGroups[dateStr] = { groupsByName: {}, unlinkedSessions: [] };
            }

            const name = day.name || 'Untitled Day';
            if (!dateGroups[dateStr].groupsByName[name]) {
                dateGroups[dateStr].groupsByName[name] = {
                    name,
                    pDay: day,
                    blockColor: block.color,
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

        (program.blocks || []).forEach((block) => {
            (block.days || []).forEach((day) => {
                if (day.date) {
                    addDayToDateGroup(getDatePart(day.date), day, block);
                }

                if (day.day_of_week && day.day_of_week.length > 0 && block.start_date && block.end_date) {
                    const start = moment(getDatePart(block.start_date));
                    const end = moment(getDatePart(block.end_date));
                    const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

                    const activeDays = [...new Set((Array.isArray(day.day_of_week) ? day.day_of_week : [day.day_of_week])
                        .map((dayName) => dayMap[dayName])
                        .filter((value) => value !== undefined))];

                    activeDays.forEach((dayOfWeek) => {
                        const current = start.clone().day(dayOfWeek);
                        if (current.isBefore(start)) {
                            current.add(7, 'days');
                        }
                        while (current.isSameOrBefore(end)) {
                            addDayToDateGroup(current.format('YYYY-MM-DD'), day, block);
                            current.add(7, 'days');
                        }
                    });
                }
            });
        });

        sessions.forEach((session) => {
            const dateStr = getISOYMDInTimezone(session.session_start || session.created_at, timezone);
            if (!dateGroups[dateStr]) {
                dateGroups[dateStr] = { groupsByName: {}, unlinkedSessions: [] };
            }

            const programDayId = getSessionProgramDayId(session);
            const programDay = programDayId ? programDaysMap.get(programDayId) : null;

            if (programDay) {
                const name = programDay.name;
                if (!dateGroups[dateStr].groupsByName[name]) {
                    // Only use the block color if the session date falls within the block's date range.
                    // Sessions completed outside the block window (e.g. a day late) shouldn't
                    // inherit the block color since the date now belongs to a different block.
                    const owningBlock = (program.blocks || []).find(b =>
                        (b.days || []).some(d => d.id === programDayId)
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
                    id: `pday-${dateStr}-${group.name}`,
                    title: `${isProgramDayCompleted ? '✓ ' : '📋 '}${group.name}`,
                    start: dateStr,
                    allDay: true,
                    backgroundColor: 'transparent',
                    borderColor: 'transparent',
                    textColor: 'inherit',
                    classNames: ['program-day-event'],
                    extendedProps: {
                        type: 'program_day',
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
                });
            });

            data.unlinkedSessions.forEach((session) => {
                const completed = isCompletedSession(session);
                events.push({
                    id: `session-${session.id}`,
                    title: `${completed ? '✓ ' : '📋 '}${session.name}`,
                    start: dateStr,
                    allDay: true,
                    backgroundColor: 'transparent',
                    borderColor: 'transparent',
                    textColor: 'inherit',
                    extendedProps: {
                        type: 'session',
                        sortOrder: 2,
                        isCompleted: completed,
                        ...session,
                    },
                });
            });
        });

        sortedBlocks.forEach((block) => {
            if (!block.start_date || !block.end_date) {
                return;
            }

            events.push({
                id: `block-bg-${block.id}`,
                title: block.name,
                start: getDatePart(block.start_date),
                end: moment(getDatePart(block.end_date)).add(1, 'days').format('YYYY-MM-DD'),
                backgroundColor: block.color || '#3A86FF',
                borderColor: block.color || '#3A86FF',
                textColor: 'white',
                allDay: true,
                display: 'background',
                extendedProps: { type: 'block_background', ...block },
            });
        });

        goals.forEach((goal) => {
            if (!goal.deadline || !attachedGoalIds.has(goal.id)) {
                return;
            }

            const goalType = goal.attributes?.type || goal.type;
            const completed = goal.completed || goal.attributes?.completed;
            const completionDate = goal.completed_at || goal.attributes?.completed_at;

            events.push({
                id: `goal-${goal.id}`,
                title: completed ? `✅ ${goal.name}` : `🎯 ${goal.name}`,
                start: (completed && completionDate)
                    ? getISOYMDInTimezone(completionDate, timezone)
                    : getDatePart(goal.deadline),
                allDay: true,
                backgroundColor: getGoalColor(goalType),
                borderColor: getGoalColor(goalType),
                textColor: getGoalTextColor(goalType),
                extendedProps: { type: 'goal', sortOrder: 3, ...goal },
                classNames: completed ? ['completed-goal-event', 'clickable-goal-event'] : ['clickable-goal-event'],
            });
        });

        return events;
    }, [
        attachedGoalIds,
        getGoalColor,
        getGoalTextColor,
        goals,
        program,
        programDaysMap,
        sessions,
        sortedBlocks,
        timezone,
    ]);

    const programMetrics = useMemo(() => {
        if (!program) {
            return null;
        }

        const programSessions = sessions.filter((session) => {
            const programDayId = getSessionProgramDayId(session);
            return programDayId && programDaysMap.has(programDayId);
        });

        return {
            completedSessions: programSessions.filter((session) => session.completed).length,
            scheduledSessions: Array.from(programDaysMap.values()).reduce((sum, day) => sum + (day.templates?.length || 0), 0),
            totalDuration: programSessions.reduce((sum, session) => sum + (session.total_duration_seconds || 0), 0),
            goalsMet: Array.from(attachedGoalIds).filter((goalId) => {
                const goal = getGoalDetails(goalId);
                return goal && (goal.completed || goal.attributes?.completed);
            }).length,
            totalGoals: attachedGoalIds.size,
            daysRemaining: Math.max(0, moment(program.end_date).startOf('day').diff(moment().startOf('day'), 'days')),
        };
    }, [attachedGoalIds, getGoalDetails, program, programDaysMap, sessions]);

    const activeBlock = useMemo(() => {
        return program?.blocks?.find((block) => isBlockActive(block)) || null;
    }, [program?.blocks]);

    const associatedGoals = useMemo(() => {
        return Array.from(attachedGoalIds || [])
            .map((goalId) => getGoalDetails(goalId))
            .filter(Boolean);
    }, [attachedGoalIds, getGoalDetails]);

    const blockGoalsByBlockId = useMemo(() => {
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
    }, [associatedGoals, sortedBlocks]);

    const blockMetrics = useMemo(() => {
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
            completedSessions: blockSessions.filter((session) => session.completed).length,
            scheduledSessions: blockSessions.length,
            goalsMet: blockGoals.filter((goal) => goal && (goal.completed || goal.attributes?.completed)).length,
            totalGoals: blockGoals.length,
            totalDuration: blockSessions.reduce((sum, session) => sum + (session.total_duration_seconds || 0), 0),
            daysRemaining: Math.max(0, moment(activeBlock.end_date).startOf('day').diff(moment().startOf('day'), 'days')),
        };
    }, [activeBlock, blockGoalsByBlockId, programDaysMap, sessions]);

    const attachBlock = useMemo(() => {
        return sortedBlocks.find((block) => block.id === attachBlockId) || null;
    }, [attachBlockId, sortedBlocks]);

    return {
        sortedBlocks,
        calendarEvents,
        programMetrics,
        activeBlock,
        blockMetrics,
        attachBlock,
        programDaysMap,
        blockGoalsByBlockId,
        hierarchyGoalSeeds,
    };
}

export default useProgramDetailViewModel;
