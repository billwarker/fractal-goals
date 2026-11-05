import React, { useMemo, useRef } from 'react';

import { getChildType } from '../../../utils/goalHelpers';
import { flattenGoalTree, getGoalNodeChildren } from '../../../utils/goalNodeModel';
import GoalHierarchySelectionModal from '../../goals/GoalHierarchySelectionModal';

const canHoldGoals = (goal) => Boolean(getChildType(goal?.type));

/** Goals associated with an activity: directly, through its group, or inheriting from a parent that is. */
export function goalIdsForActivity(node, activity, parentHasIt = false) {
    if (!node) return [];
    const attributes = node.attributes || {};
    const hasIt = Boolean(
        attributes.associated_activity_ids?.includes(activity.id)
        || (activity.group_id && attributes.associated_activity_group_ids?.includes(activity.group_id))
        || (parentHasIt && attributes.inherit_parent_activities),
    );
    const below = getGoalNodeChildren(node).flatMap((child) => goalIdsForActivity(child, activity, hasIt));
    return hasIt ? [node.id, ...below] : below;
}

/**
 * The first step of a goal set from a chart: which goal it goes under. Starts on the chart's goal
 * when it could hold one, else the root. Goals at the lowest level can't be picked. For a target on
 * an activity it starts on the goals associated with that activity, with a checkbox for the rest;
 * if none of those could hold the new goal, it starts on them all.
 *
 * @param {{ tree: any, activity?: { id: string, name: string, group_id?: string } | null, initialGoalId?: string | null,
 *   onPick: (goalId: string) => void, onCancel: () => void }} props
 */
export default function GoalParentPicker({ tree, activity = null, initialGoalId = null, onPick, onCancel }) {
    // The modal closes after any confirm, so a close after a pick isn't a cancel.
    const picked = useRef(false);
    const goals = useMemo(() => flattenGoalTree(tree, { includeRoot: true }), [tree]);
    const scopeGoalIds = useMemo(() => (activity ? goalIdsForActivity(tree, activity) : []), [activity, tree]);
    const { selectedGoalIds, startScoped } = useMemo(() => {
        const usable = (goal) => goal && canHoldGoals(goal) && !goal.completed;
        const scoped = goals.filter((goal) => scopeGoalIds.includes(goal.id) && usable(goal));
        const candidates = scoped.length ? scoped : goals.filter(usable);
        const start = candidates.find((goal) => goal.id === initialGoalId) || candidates[0];
        return { selectedGoalIds: start ? [start.id] : [], startScoped: scoped.length > 0 };
    }, [goals, initialGoalId, scopeGoalIds]);

    return (
        <GoalHierarchySelectionModal
            isOpen
            title="Which goal should this go under?"
            goals={goals}
            selectedGoalIds={selectedGoalIds}
            selectionMode="single"
            searchPlaceholder="Search goals..."
            emptyState="No goals available."
            connectorHighlightMode="bulk"
            showGoalHighlightHalo
            initialHideCompletedGoals
            scopeGoalIds={scopeGoalIds}
            scopeLabel={scopeGoalIds.length ? activity.name : ''}
            scopeControlLabel={scopeGoalIds.length ? `Only goals associated with ${activity.name}` : ''}
            initialScopeEnabled={startScoped}
            getGoalDisabledReason={(goal) => (canHoldGoals(goal) ? null : 'Goals at this level can’t have sub-goals')}
            confirmLabel="Next"
            onConfirm={([goalId]) => {
                if (!goalId) throw new Error('Choose a goal to put this under.');
                picked.current = true;
                onPick(goalId);
            }}
            onClose={() => {
                if (!picked.current) onCancel();
            }}
        />
    );
}
