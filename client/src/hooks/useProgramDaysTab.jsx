import React, { useCallback, useEffect, useMemo, useState } from 'react';

import PlanGoalHierarchyPanel from '../components/programs/days/PlanGoalHierarchyPanel';
import ProgramDaysNavigator from '../components/programs/days/ProgramDaysNavigator';
import { buildPlanGoalsView, planGoalsViewHasGoal } from '../utils/planGoalsView';
import { resolveDaysSelection } from '../utils/programDaysView';
import { sortProgramDays } from '../utils/programViewModel';
import { useGoalActivities } from './useGoalQueries';
import { useProgramPlanOccurrences } from './useProgramSessionPlans';
import { useSessionGoalsView } from './useSessionQueries';

/**
 * Programs page Days tab state: which program day, date, and template is being planned,
 * whether a second date is shown to compare against, the program's occurrence rails, and
 * the side-pane navigator that drives them. Program days belong to the program, so the
 * navigator lists each once and creates new ones.
 * `onLeavePane` closes the mobile side pane after a choice so the plans are visible.
 */
/** ``days`` in ``order`` (day ids); days the order doesn't name keep their place at the end. */
function applyDayOrder(days, order) {
    if (!order) return days;
    const position = new Map(order.map((id, index) => [id, index]));
    return [...days].sort((left, right) => (
        (position.get(String(left.id)) ?? order.length) - (position.get(String(right.id)) ?? order.length)
    ));
}

function sameActivePlan(left, right) {
    return left?.date === right?.date
        && left?.templateId === right?.templateId
        && left?.readOnly === right?.readOnly
        && left?.templateName === right?.templateName
        && left?.selectedActivityId === right?.selectedActivityId
        && left?.sessionId === right?.sessionId
        && (left?.activityIds || []).join(',') === (right?.activityIds || []).join(',')
        && JSON.stringify(left?.instances || null) === JSON.stringify(right?.instances || null);
}

export default function useProgramDaysTab({
    rootId, program, today, timezone, enabled, setViewMode, onLeavePane, onCreateDay, onEditDay,
    onReorderDays = null, goalTree = null, activities = [], activityGroups = [], onGoalClick = null,
}) {
    const [selection, setSelection] = useState(null);
    // One program day at a time by default; the side pane toggles a second, comparison column.
    const [compare, setCompare] = useState(false);
    // A move shows at once; the saved order replaces it once the program refreshes.
    const [pendingOrder, setPendingOrder] = useState(null);
    const days = applyDayOrder(sortProgramDays(program?.days || []), pendingOrder);
    const occurrencesQuery = useProgramPlanOccurrences(rootId, enabled ? program?.id : null, timezone);
    const resolved = resolveDaysSelection({
        days, occurrencesByDay: occurrencesQuery.data, selection, today, compare,
    });
    const selectedDay = resolved.found?.day || null;

    // The plan card the Goals side pane follows (one template on one date; null keys mean the
    // planning column's first card), what that card reports about itself, and the goal its
    // activity picker is scoped to, as on the session page.
    const [activeKey, setActiveKey] = useState(null);
    const [activePlan, setActivePlan] = useState(null);
    const [scopedGoal, setScopedGoal] = useState(null);
    const [scopeAnnouncement, setScopeAnnouncement] = useState('');
    const activatePlan = useCallback((key) => setActiveKey((current) => (
        current?.date === key.date && current?.templateId === key.templateId ? current : key
    )), []);
    const reportActivePlan = useCallback((plan) => setActivePlan((current) => (
        sameActivePlan(current, plan) ? current : plan
    )), []);
    // Scope belongs to the Days tab: leaving it, or choosing another day, clears it. Reset while
    // rendering (not in an effect), so the new day's cards report after the reset, not before it.
    const focusOwner = `${Boolean(enabled)}|${selectedDay ? String(selectedDay.id) : ''}`;
    const [focusOwnerSeen, setFocusOwnerSeen] = useState(focusOwner);
    if (focusOwnerSeen !== focusOwner) {
        setFocusOwnerSeen(focusOwner);
        setActiveKey(null);
        setActivePlan(null);
        setScopedGoal(null);
    }
    // The selected date must be on screen: a key for a date no longer shown falls back to the default.
    const visibleKey = activeKey && resolved.columnDates.includes(activeKey.date)
        ? activeKey
        : { date: resolved.date, templateId: null };

    // Like a session started from the day: the day's goals, else the program's.
    const scopeGoalIds = useMemo(() => (
        selectedDay?.goal_ids?.length ? selectedDay.goal_ids : (program?.goal_ids || [])
    ), [program?.goal_ids, selectedDay?.goal_ids]);
    const builtGoalsView = useMemo(() => buildPlanGoalsView({
        goalTree,
        scopeGoalIds,
        activityIds: activePlan?.activityIds || [],
        activities,
        activityGroups,
    }), [activePlan?.activityIds, activities, activityGroups, goalTree, scopeGoalIds]);
    // A logged session shows its own evidence, exactly as its session page does (shared cache).
    const loggedSessionId = activePlan?.sessionId || null;
    const sessionGoalsViewQuery = useSessionGoalsView(rootId, loggedSessionId);
    const planGoalsView = (loggedSessionId && sessionGoalsViewQuery.data) || builtGoalsView;
    // A scope survives switching cards only while its goal is still in the hierarchy.
    useEffect(() => {
        if (!scopedGoal || !planGoalsView || planGoalsViewHasGoal(planGoalsView, scopedGoal.id)) return;
        setScopedGoal(null);
        setScopeAnnouncement(`Activity scope for ${scopedGoal.name} cleared: this plan doesn't work toward it.`);
    }, [planGoalsView, scopedGoal]);
    const toggleGoalScope = useCallback((goal) => {
        if (!goal?.id) return;
        setScopeAnnouncement('');
        setScopedGoal((current) => (String(current?.id) === String(goal.id) ? null : goal));
    }, []);
    const clearGoalScope = useCallback(() => setScopedGoal(null), []);
    const goalActivitiesQuery = useGoalActivities(rootId, scopedGoal?.id);
    const activityGoalScope = useMemo(() => (scopedGoal ? {
        goal: scopedGoal,
        activityIds: (goalActivitiesQuery.data || []).map((activity) => String(activity.id)),
        isLoading: goalActivitiesQuery.isLoading,
        isError: goalActivitiesQuery.isError,
        onRetry: goalActivitiesQuery.refetch,
        onClear: clearGoalScope,
    } : null), [
        clearGoalScope, goalActivitiesQuery.data, goalActivitiesQuery.isError,
        goalActivitiesQuery.isLoading, goalActivitiesQuery.refetch, scopedGoal,
    ]);
    const planFocus = {
        activeKey: visibleKey,
        onActivate: activatePlan,
        onReport: reportActivePlan,
        activityGoalScope,
        dayGoalIds: selectedDay?.goal_ids || [],
        announcement: scopeAnnouncement,
    };
    // The side pane's Goals view: the active plan card's goal hierarchy.
    const goalsPanel = selectedDay ? (
        <PlanGoalHierarchyPanel
            planGoalsView={planGoalsView}
            activities={activities}
            activePlan={activePlan}
            dayName={selectedDay.name}
            activityGoalScope={activityGoalScope}
            onGoalScopeToggle={toggleGoalScope}
            onGoalClick={onGoalClick}
            onEditDayGoals={onEditDay ? () => onEditDay(selectedDay) : null}
        />
    ) : null;

    // Keeps the chosen dates when staying on the same day; a template brings its plan into view.
    const selectDay = (dayId, templateId = null) => {
        setSelection((current) => {
            const sameDay = String(current?.dayId) === String(dayId);
            return {
                dayId,
                date: sameDay ? current?.date || null : null,
                compareDate: sameDay ? current?.compareDate || null : null,
                templateId,
            };
        });
        onLeavePane();
    };

    const openDayPlan = (dayId, date) => {
        setSelection({ dayId, date });
        setViewMode('days');
        onLeavePane();
    };

    // A day just created or duplicated becomes the selection, so it never gets lost in the list.
    const showDay = (dayId) => {
        if (dayId) setSelection({ dayId });
    };

    const moveDay = async (dayId, offset) => {
        const ids = days.map((day) => String(day.id));
        const from = ids.indexOf(String(dayId));
        const to = from + offset;
        if (!onReorderDays || from < 0 || to < 0 || to >= ids.length) return;
        [ids[from], ids[to]] = [ids[to], ids[from]];
        setPendingOrder(ids);
        try {
            await onReorderDays(ids);
        } catch {
            // The mutation reports the failure; the saved order shows again.
        } finally {
            setPendingOrder((current) => (current === ids ? null : current));
        }
    };

    const navigator = (
        <ProgramDaysNavigator
            days={days}
            occurrencesByDay={occurrencesQuery.data}
            selectedDayId={resolved.found?.day.id || null}
            onSelectDay={(dayId) => selectDay(dayId)}
            onSelectTemplate={selectDay}
            onCreateDay={onCreateDay}
            onEditDay={onEditDay}
            onMoveDay={onReorderDays ? moveDay : null}
            today={today}
            compare={compare}
            onCompareChange={setCompare}
        />
    );

    return {
        days,
        selection,
        setSelection,
        compare,
        openDayPlan,
        showDay,
        navigator,
        resolved,
        occurrencesQuery,
        planFocus,
        goalsPanel,
    };
}
