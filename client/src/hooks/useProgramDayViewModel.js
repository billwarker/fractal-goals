import { useMemo } from 'react';
import {
    formatLiteralDate,
    getDatePart,
    getDayOfWeekIndex,
    getISOYMDInTimezone,
    isDateBeforeToday,
} from '../utils/dateUtils';


function getLocalDateString(dateTimeStr, timezone) {
    return getISOYMDInTimezone(dateTimeStr, timezone);
}

export function useProgramDayViewModel({
    date,
    program,
    goals = [],
    blocks = [],
    sessions = [],
    timezone,
    selectedBlockId = '',
}) {
    const isPastDate = useMemo(() => {
        return isDateBeforeToday(date);
    }, [date]);

    const blocksContainingDate = useMemo(() => {
        return (blocks || []).filter((block) => {
            if (!block.start_date || !block.end_date) {
                return false;
            }

            const start = getDatePart(block.start_date);
            const end = getDatePart(block.end_date);
            return date >= start && date <= end;
        });
    }, [blocks, date]);

    const effectiveBlockId = selectedBlockId || (blocksContainingDate.length === 1 ? blocksContainingDate[0].id : '');

    const scheduledProgramDays = useMemo(() => {
        const result = [];
        (program?.blocks || []).forEach((block) => {
            (block.days || []).forEach((day) => {
                let isScheduledForDate = false;

                if (day.date && getDatePart(day.date) === date) {
                    isScheduledForDate = true;
                } else if (day.day_of_week && block.start_date && block.end_date) {
                    const start = getDatePart(block.start_date);
                    const end = getDatePart(block.end_date);
                    if (date >= start && date <= end) {
                        const dows = Array.isArray(day.day_of_week) ? day.day_of_week : [day.day_of_week];
                        if (dows.length > 0) {
                            const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
                            const activeDays = dows.map((dayName) => dayMap[dayName]).filter((value) => value !== undefined);
                            const targetDayOfWeek = getDayOfWeekIndex(date);
                            if (activeDays.includes(targetDayOfWeek)) {
                                isScheduledForDate = true;
                            }
                        }
                    }
                }

                if (isScheduledForDate) {
                    result.push({
                        ...day,
                        blockName: block.name,
                        blockId: block.id,
                        blockColor: block.color,
                        isRecurringTemplate: !day.date && !!day.day_of_week && day.day_of_week.length > 0,
                        type: 'program_day',
                    });
                }
            });
        });
        return result;
    }, [date, program?.blocks]);

    const scheduledSessions = useMemo(() => {
        return (sessions || []).filter((session) => {
            const start = session.session_start || session.start_time;
            return getLocalDateString(start, timezone) === date && !(session.completed || session.attributes?.completed);
        });
    }, [date, sessions, timezone]);

    const completedSessions = useMemo(() => {
        return (sessions || []).filter((session) => {
            const start = session.session_start || session.start_time;
            return getLocalDateString(start, timezone) === date && Boolean(session.completed || session.attributes?.completed);
        });
    }, [date, sessions, timezone]);

    const scheduledProgramDayData = useMemo(() => {
        const claimedSessionIds = new Set();

        return scheduledProgramDays.map((programDay) => {
            const templates = programDay.templates || [];
            const daySessions = [];

            [...scheduledSessions, ...completedSessions].forEach((session) => {
                if (claimedSessionIds.has(session.id)) {
                    return;
                }

                const isPreciseMatch = session.program_day_id === programDay.id;
                const isFuzzyMatch = templates.some((template) => template.name === session.name);

                if (isPreciseMatch || isFuzzyMatch) {
                    daySessions.push(session);
                    claimedSessionIds.add(session.id);
                }
            });

            return { ...programDay, sessions: daySessions };
        });
    }, [completedSessions, scheduledProgramDays, scheduledSessions]);

    const claimedSessionIds = useMemo(() => {
        return new Set(
            scheduledProgramDayData.flatMap((programDay) => (programDay.sessions || []).map((session) => session.id))
        );
    }, [scheduledProgramDayData]);

    const looseScheduledSessions = useMemo(() => {
        return scheduledSessions.filter((session) => !claimedSessionIds.has(session.id));
    }, [claimedSessionIds, scheduledSessions]);

    const looseCompletedSessions = useMemo(() => {
        return completedSessions.filter((session) => !claimedSessionIds.has(session.id));
    }, [claimedSessionIds, completedSessions]);

    const scheduledSessionCount = useMemo(() => {
        const scheduledTemplateCount = scheduledProgramDayData.reduce((sum, day) => sum + (day.templates?.length || 0), 0);
        return scheduledTemplateCount + looseScheduledSessions.length;
    }, [looseScheduledSessions.length, scheduledProgramDayData]);

    const completedSessionCount = completedSessions.length;

    const goalsDueOnDate = useMemo(() => {
        return (goals || []).filter((goal) => goal.deadline && getDatePart(goal.deadline) === date);
    }, [date, goals]);

    const goalsCompletedOnDate = useMemo(() => {
        return (goals || []).filter((goal) => {
            const isCompleted = goal.completed || goal.attributes?.completed;
            const completionDate = goal.completed_at || goal.attributes?.completed_at;
            return isCompleted && completionDate && getLocalDateString(completionDate, timezone) === date;
        });
    }, [date, goals, timezone]);

    const eligibleGoalsForDate = useMemo(() => {
        const goalsById = new Map((goals || []).map((goal) => [goal.id, goal]));

        return (goals || []).filter((goal) => {
            const parentId = goal.parent_id || goal.attributes?.parent_id;
            if (!parentId) {
                return true;
            }

            const parentGoal = goalsById.get(parentId);
            if (!parentGoal?.deadline) {
                return true;
            }

            return getDatePart(date) <= getDatePart(parentGoal.deadline);
        });
    }, [date, goals]);

    const availableScheduleDays = useMemo(() => {
        const block = blocks?.find((entry) => entry.id === effectiveBlockId);
        const allDays = block?.days || [];

        const uniqueDays = [];
        const seenNames = new Set();
        const sortedDays = [...allDays].sort((left, right) => {
            if (!left.date && right.date) return -1;
            if (left.date && !right.date) return 1;
            return 0;
        });

        sortedDays.forEach((day) => {
            const name = day.name || `Day ${day.day_number}`;
            if (!seenNames.has(name)) {
                seenNames.add(name);
                uniqueDays.push(day);
            }
        });

        return uniqueDays;
    }, [blocks, effectiveBlockId]);

    return {
        isPastDate,
        blocksContainingDate,
        effectiveBlockId,
        scheduledProgramDayData,
        looseScheduledSessions,
        looseCompletedSessions,
        scheduledSessionCount,
        completedSessionCount,
        goalsDueOnDate,
        goalsCompletedOnDate,
        eligibleGoalsForDate,
        availableScheduleDays,
        formatDate: (value) => formatLiteralDate(value, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        }),
    };
}

export default useProgramDayViewModel;
