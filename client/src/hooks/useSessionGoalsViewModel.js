import { useMemo } from 'react';
import { parseTargets } from '../utils/goalUtils';
import { getGoalStatus, getTargetStatus } from '../utils/sessionGoalStatus';

function toNodeShape(node, depth = 0, isLinked = false) {
    if (!node) return null;
    return {
        id: node.id,
        name: node.attributes?.name || node.name,
        type: node.attributes?.type || node.type,
        description: node.attributes?.description || node.description,
        relevance_statement: node.attributes?.relevance_statement,
        deadline: node.attributes?.deadline || node.deadline,
        completed: Boolean(node.completed || node.attributes?.completed),
        is_smart: node.is_smart,
        depth,
        isLinked,
        targets: parseTargets(node),
        attributes: node.attributes || {},
        children: node.children || [],
        parent_id: node.parent_id || node.attributes?.parent_id || null,
        activity_definition_id: node.activity_definition_id || node.attributes?.activity_definition_id || null,
    };
}

function flattenGoalTree(node, goalIds, depth = 0) {
    if (!node) return [];
    const flattenedChildren = (node.children || []).flatMap((child) => flattenGoalTree(child, goalIds, depth + 1));
    return [toNodeShape(node, depth, goalIds.has(node.id)), ...flattenedChildren];
}

function buildRelevantStructuralHierarchy(node, relevantGoalIds, depth = 0) {
    if (!node) return [];

    const childNodes = (node.children || [])
        .flatMap((child) => buildRelevantStructuralHierarchy(child, relevantGoalIds, depth + 1));
    const isRelevant = relevantGoalIds.has(node.id);
    const isStructuralExecutionGoal = node.type === 'MicroGoal' || node.type === 'NanoGoal' || node.attributes?.type === 'MicroGoal' || node.attributes?.type === 'NanoGoal';

    if (!isRelevant && childNodes.length === 0 && depth !== 0) {
        return [];
    }

    const currentNode = toNodeShape(node, depth, isRelevant);
    return isStructuralExecutionGoal ? childNodes : [currentNode, ...childNodes];
}

function injectMicroGoals(structuredNodes, microGoals, sessionCompletedGoalIds, targetAchievements, achievedTargetIds) {
    if (!structuredNodes.length || !microGoals.length) return structuredNodes;

    const microGoalsByParent = microGoals.reduce((acc, microGoal) => {
        const parentId = microGoal.parent_id || microGoal.attributes?.parent_id;
        if (!parentId) return acc;
        if (!acc[parentId]) acc[parentId] = [];
        acc[parentId].push(microGoal);
        return acc;
    }, {});

    const withMicros = [];
    structuredNodes.forEach((node) => {
        withMicros.push(node);

        const childMicros = microGoalsByParent[node.id] || [];
        childMicros.forEach((microGoal) => {
            const microNode = toNodeShape(microGoal, (node.depth || 0) + 1, true);
            const microStatus = getGoalStatus(microNode, targetAchievements, achievedTargetIds);
            withMicros.push({ ...microNode, status: microStatus });
            (microGoal.children || []).forEach((nanoGoal) => {
                const nanoNode = toNodeShape(nanoGoal, (node.depth || 0) + 2, true);
                const nanoStatus = getGoalStatus(nanoNode, targetAchievements, achievedTargetIds);
                withMicros.push({ ...nanoNode, status: nanoStatus });
            });
        });
    });

    return withMicros;
}

export function useSessionGoalsViewModel({
    sessionGoalsView,
    session,
    selectedActivity,
    targetAchievements,
    achievedTargetIds,
}) {
    const sessionCompletedGoalIds = useMemo(() => {
        if (!sessionGoalsView?.goal_tree || !session) return new Set();

        const toMillis = (value) => {
            if (!value) return null;
            const parsed = Date.parse(value);
            return Number.isNaN(parsed) ? null : parsed;
        };

        const sessionStartMs = toMillis(session.session_start || session.created_at);
        const sessionEndMs = session.completed
            ? toMillis(session.session_end || session.completed_at || session.updated_at)
            : Date.now() + 60000;

        if (sessionStartMs === null || sessionEndMs === null) return new Set();

        const ids = new Set();
        const visit = (node) => {
            if (!node) return;
            const completedAtRaw = node.attributes?.completed_at || node.completed_at;
            const completedAtMs = toMillis(completedAtRaw);
            if (completedAtMs !== null && completedAtMs >= sessionStartMs && completedAtMs <= sessionEndMs) {
                ids.add(node.id);
            }
            (node.children || []).forEach(visit);
        };
        visit(sessionGoalsView.goal_tree);
        return ids;
    }, [sessionGoalsView, session]);

    const activeActivityDefId = selectedActivity?.activity_definition_id || selectedActivity?.activity_id || null;
    const activeActivityInstanceId = selectedActivity?.id || null;

    const sessionHierarchy = useMemo(() => {
        if (!sessionGoalsView?.goal_tree) return [];

        const baseNodes = flattenGoalTree(
            sessionGoalsView.goal_tree,
            new Set(sessionGoalsView.session_goal_ids || [])
        )
            .filter((node) => node.type !== 'MicroGoal' && node.type !== 'NanoGoal')
            .map((node) => ({
            ...node,
            status: getGoalStatus(node, targetAchievements, achievedTargetIds)
        }));

        return injectMicroGoals(
            baseNodes,
            sessionGoalsView.micro_goals || [],
            sessionCompletedGoalIds,
            targetAchievements,
            achievedTargetIds
        );
    }, [sessionGoalsView, targetAchievements, achievedTargetIds, sessionCompletedGoalIds]);

    const activityHierarchy = useMemo(() => {
        if (!activeActivityDefId || !sessionGoalsView?.goal_tree) return [];
        const associatedGoalIds = new Set(
            sessionGoalsView.activity_goal_ids_by_activity?.[activeActivityDefId] || []
        );

        const relevantMicroGoals = (sessionGoalsView.micro_goals || []).filter((microGoal) => {
            const microTargets = parseTargets(microGoal);
            const instanceBoundTargetIds = microTargets
                .map((target) => target.activity_instance_id)
                .filter(Boolean);
            const isInstanceBound = instanceBoundTargetIds.length > 0;
            const hasInstanceBoundTargetForFocusedActivity = Boolean(
                activeActivityInstanceId && microTargets.some((target) => target.activity_instance_id === activeActivityInstanceId)
            );
            const hasDefinitionScopedTargetForFocusedActivity = microTargets.some((target) => (
                target.activity_id === activeActivityDefId && !target.activity_instance_id
            ));

            if (hasInstanceBoundTargetForFocusedActivity) return true;
            if (isInstanceBound) return false;
            if (microGoal.activity_definition_id === activeActivityDefId && !microTargets.some((target) => target.activity_instance_id)) return true;
            if (hasDefinitionScopedTargetForFocusedActivity) return true;
            const parentId = microGoal.parent_id || microGoal.attributes?.parent_id;
            return associatedGoalIds.has(microGoal.id) || associatedGoalIds.has(parentId);
        });

        const relevantStructuralGoalIds = new Set([...associatedGoalIds]);
        relevantMicroGoals.forEach((microGoal) => {
            const parentId = microGoal.parent_id || microGoal.attributes?.parent_id;
            if (parentId) relevantStructuralGoalIds.add(parentId);
        });

        const baseNodes = buildRelevantStructuralHierarchy(sessionGoalsView.goal_tree, relevantStructuralGoalIds)
            .map((node) => ({
                ...node,
                status: getGoalStatus(node, targetAchievements, achievedTargetIds)
            }));

        return injectMicroGoals(
            baseNodes,
            relevantMicroGoals,
            sessionCompletedGoalIds,
            targetAchievements,
            achievedTargetIds
        );
    }, [activeActivityDefId, activeActivityInstanceId, sessionGoalsView, targetAchievements, achievedTargetIds, sessionCompletedGoalIds]);

    const targetCards = useMemo(() => {
        const sourceHierarchy = activeActivityDefId ? activityHierarchy : sessionHierarchy;
        const cards = [];

        sourceHierarchy.forEach((goal) => {
            const goalTargets = parseTargets(goal);
            goalTargets.forEach((target) => {
                if (activeActivityDefId && target.activity_id !== activeActivityDefId) return;
                if (target.activity_instance_id && selectedActivity?.id && target.activity_instance_id !== selectedActivity.id) return;
                if (target.activity_instance_id && !selectedActivity?.id) return;

                const status = getTargetStatus(target, goal, targetAchievements, achievedTargetIds);
                cards.push({
                    ...target,
                    _goalDepth: goal.depth || 0,
                    _goalName: goal.name,
                    _goalType: goal.type,
                    _goalId: goal.id,
                    is_completed_realtime: status.isCompleted,
                    completion_reason: status.reason
                });
            });
        });

        return cards.sort((a, b) => b._goalDepth - a._goalDepth);
    }, [activeActivityDefId, activityHierarchy, sessionHierarchy, selectedActivity, targetAchievements, achievedTargetIds]);

    const goalStatusById = useMemo(() => {
        const map = new Map();
        [...sessionHierarchy, ...activityHierarchy].forEach((goal) => {
            if (!map.has(goal.id)) map.set(goal.id, goal.status);
        });
        return map;
    }, [sessionHierarchy, activityHierarchy]);

    const targetStatusById = useMemo(() => {
        const map = new Map();
        targetCards.forEach((target) => {
            map.set(target.id, {
                completed: target.is_completed_realtime,
                reason: target.completion_reason,
            });
        });
        return map;
    }, [targetCards]);

    return {
        activeActivityDefId,
        activeActivityInstanceId,
        sessionHierarchy,
        activityHierarchy,
        targetCards,
        goalStatusById,
        targetStatusById,
        sessionActivityIds: new Set(sessionGoalsView?.session_activity_ids || []),
    };
}

export default useSessionGoalsViewModel;
