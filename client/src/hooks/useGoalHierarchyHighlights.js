import { useCallback } from 'react';

/**
 * The goal hierarchy's highlight, connector, and scope-icon props, shared by the session
 * page and dated plans so both panes read the same: the selected activity's goals are the
 * target with their ancestors along the lineage; connectors are solid to goals with evidence,
 * completed where that evidence is done, dashed otherwise. A goal's icon scopes the activity
 * picker to it (pass no `onGoalScopeToggle` to leave icons inert).
 */
export default function useGoalHierarchyHighlights({
    selectedActivityGoalIds,
    selectedActivityAncestorIds,
    evidenceGoalIds,
    completedEvidenceGoalIds,
    activityGoalScope = null,
    onGoalScopeToggle = null,
    getGoalIcon,
    getGoalColor,
    getGoalSecondaryColor,
}) {
    const hasActivityHighlight = selectedActivityGoalIds.size > 0;

    const getGoalBranchHighlightState = useCallback((goal) => {
        const goalId = String(goal.id);
        if (selectedActivityGoalIds.has(goalId)) return 'target';
        if (selectedActivityAncestorIds.has(goalId)) return 'ancestor';
        return null;
    }, [selectedActivityAncestorIds, selectedActivityGoalIds]);

    const getGoalConnectorHighlightState = useCallback((goal) => {
        if (!hasActivityHighlight) return false;
        return Boolean(getGoalBranchHighlightState(goal));
    }, [getGoalBranchHighlightState, hasActivityHighlight]);

    const getGoalConnectorEdgeHighlightState = useCallback((parentGoal, childGoal) => {
        if (!hasActivityHighlight) return false;
        const childId = String(childGoal.id);
        return selectedActivityGoalIds.has(childId) || selectedActivityAncestorIds.has(childId);
    }, [hasActivityHighlight, selectedActivityAncestorIds, selectedActivityGoalIds]);

    const getGoalConnectorEdgeState = useCallback((_parentGoal, childGoal) => {
        const childId = String(childGoal.id);
        if (selectedActivityGoalIds.has(childId) || selectedActivityAncestorIds.has(childId)) return 'selected';
        if (completedEvidenceGoalIds.has(childId)) return 'completed';
        if (evidenceGoalIds.has(childId)) return 'solid';
        return 'dashed';
    }, [completedEvidenceGoalIds, evidenceGoalIds, selectedActivityAncestorIds, selectedActivityGoalIds]);

    const onGoalIconClick = onGoalScopeToggle ? (goal) => onGoalScopeToggle({
        ...goal,
        scopePresentation: {
            icon: getGoalIcon(goal.type),
            color: getGoalColor(goal.type),
            secondaryColor: getGoalSecondaryColor(goal.type),
        },
    }) : undefined;

    return {
        getGoalBranchHighlightState,
        getGoalConnectorHighlightState,
        getGoalConnectorEdgeHighlightState,
        getGoalConnectorEdgeState,
        connectorHighlightMode: 'lineage',
        showGoalHighlightHalo: true,
        onGoalIconClick,
        isGoalIconSelected: (goal) => String(goal.id) === String(activityGoalScope?.goal?.id),
        getGoalIconActionLabel: (goal, selected) => (
            selected ? `Clear activity scope for ${goal.name}` : `Scope activities to ${goal.name}`
        ),
    };
}
