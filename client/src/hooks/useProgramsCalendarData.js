import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import {
    addDaysToDateString,
    getDatePart,
    getRecurringDatesWithinRange,
} from '../utils/dateUtils';
import { flattenGoals } from '../utils/goalHelpers';
import { getGoalDeadline } from '../utils/programGoalAssociations';
import { queryKeys } from './queryKeys';
import { useFractalTree } from './useGoalQueries';

const PROGRAM_COLORS = ['#3A86FF', '#06A77D', '#FFBE0B', '#EF476F', '#7B5CFF', '#4ECDC4'];

function getProgramColor(program, index = 0) {
    const blockColor = (program.blocks || []).find((block) => block.color)?.color;
    return blockColor || PROGRAM_COLORS[index % PROGRAM_COLORS.length];
}

function isCompletedSession(session) {
    return Boolean(session.completed || session.attributes?.completed);
}

function getProgramGoalIds(program) {
    return new Set([
        ...(program.goal_ids || []),
        ...(program.selected_goals || []),
        ...(program.blocks || []).flatMap((block) => block.goal_ids || []),
    ]);
}

export function buildProgramsCalendarEvents(programs = [], goals = [], getGoalColor, getGoalTextColor) {
    const goalById = new Map(goals.map((goal) => [goal.id, goal]));
    const events = [];

    programs.forEach((program, programIndex) => {
        const programColor = getProgramColor(program, programIndex);
        const programStart = getDatePart(program.start_date);
        const programEnd = getDatePart(program.end_date);

        if (programStart && programEnd) {
            events.push({
                id: `program-bg-${program.id}`,
                title: program.name,
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

        (program.blocks || []).forEach((block) => {
            const blockStart = getDatePart(block.start_date);
            const blockEnd = getDatePart(block.end_date);
            if (blockStart && blockEnd) {
                events.push({
                    id: `block-bg-${block.id}`,
                    title: block.name,
                    start: blockStart,
                    end: addDaysToDateString(blockEnd, 1),
                    backgroundColor: block.color || programColor,
                    borderColor: block.color || programColor,
                    display: 'background',
                    allDay: true,
                    extendedProps: {
                        type: 'block_background',
                        programId: program.id,
                        program,
                        ...block,
                        sortOrder: -10,
                    },
                });
            }

            (block.days || []).forEach((day) => {
                const dayDates = new Set();
                if (day.date) {
                    dayDates.add(getDatePart(day.date));
                }

                if (day.day_of_week?.length && blockStart && blockEnd) {
                    const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
                    const activeDays = [...new Set((Array.isArray(day.day_of_week) ? day.day_of_week : [day.day_of_week])
                        .map((dayName) => dayMap[dayName])
                        .filter((value) => value !== undefined))];
                    getRecurringDatesWithinRange(blockStart, blockEnd, activeDays).forEach((dateStr) => dayDates.add(dateStr));
                }

                dayDates.forEach((dateStr) => {
                    const daySessions = (day.sessions || []).filter((session) => getDatePart(session.session_start || session.created_at) === dateStr);
                    const templateCount = day.templates?.length || 0;
                    const isCompleted = templateCount > 0 && daySessions.filter(isCompletedSession).length >= templateCount;
                    events.push({
                        id: `program-day-${program.id}-${day.id}-${dateStr}`,
                        title: `${isCompleted ? '✓ ' : ''}${day.name || 'Program Day'}`,
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
                            pDayId: day.id,
                            blockColor: block.color || programColor,
                            isCompleted,
                            sortOrder: 0,
                        },
                    });
                });
            });
        });

        getProgramGoalIds(program).forEach((goalId) => {
            const goal = goalById.get(goalId);
            const deadline = goal ? getGoalDeadline(goal) : null;
            if (!goal || !deadline) {
                return;
            }

            const goalType = goal.attributes?.type || goal.type;
            const completed = goal.completed || goal.attributes?.completed;
            const color = getGoalColor(goalType);
            events.push({
                id: `program-goal-${program.id}-${goal.id}`,
                title: `${completed ? '✓ ' : ''}${goal.name}`,
                start: getDatePart(deadline),
                allDay: true,
                backgroundColor: color,
                borderColor: color,
                textColor: getGoalTextColor(goalType),
                classNames: completed ? ['completed-goal-event', 'clickable-goal-event'] : ['clickable-goal-event'],
                extendedProps: {
                    type: 'goal',
                    programId: program.id,
                    program,
                    sortOrder: 3,
                    ...goal,
                },
            });
        });
    });

    return events;
}

export function useProgramsCalendarData(rootId, { getGoalColor, getGoalTextColor } = {}) {
    const programsQuery = useQuery({
        queryKey: queryKeys.programs(rootId),
        enabled: Boolean(rootId),
        queryFn: async () => {
            const response = await fractalApi.getPrograms(rootId);
            return response.data || [];
        },
    });

    const goalsQuery = useFractalTree(rootId);

    const goals = useMemo(() => {
        if (!goalsQuery.data) return [];
        return flattenGoals([goalsQuery.data]);
    }, [goalsQuery.data]);

    const sortedPrograms = useMemo(() => {
        return [...(programsQuery.data || [])].sort((left, right) => {
            if (!left.start_date) return 1;
            if (!right.start_date) return -1;
            return new Date(left.start_date) - new Date(right.start_date);
        });
    }, [programsQuery.data]);

    const calendarEvents = useMemo(() => buildProgramsCalendarEvents(
        sortedPrograms,
        goals,
        getGoalColor || (() => '#3A86FF'),
        getGoalTextColor || (() => '#ffffff'),
    ), [getGoalColor, getGoalTextColor, goals, sortedPrograms]);

    return {
        programs: sortedPrograms,
        goals,
        calendarEvents,
        loading: programsQuery.isLoading || goalsQuery.isLoading,
        treeData: goalsQuery.data || null,
        refetchPrograms: programsQuery.refetch,
        refetchGoals: goalsQuery.refetch,
    };
}
