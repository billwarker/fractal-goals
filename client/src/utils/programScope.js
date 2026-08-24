import { buildTreeMaps } from '../components/flowTree/flowTreeTreeUtils';
import {
    buildProgramGoalChildrenMap,
    collectProgramGoalIds,
    expandProgramGoalIds,
} from './programGoalWindow';

const normalizeIds = (values = []) => [...new Set(values.map(String).filter(Boolean))];

export function getProgramMetricScopeGoalIds(programOrContext, treeData = null) {
    const canonical = normalizeIds(programOrContext?.scope_goal_ids || []);
    if (canonical.length > 0 || Array.isArray(programOrContext?.scope_goal_ids)) {
        return new Set(canonical);
    }

    if (!treeData) return new Set();
    const goals = [];
    const stack = [treeData];
    while (stack.length > 0) {
        const goal = stack.pop();
        if (!goal) continue;
        goals.push(goal);
        (goal.children || []).forEach((child) => stack.push(child));
    }
    const childrenById = buildProgramGoalChildrenMap(goals);
    const legacyContextSeeds = [
        ...(programOrContext?.program_goal_ids || []),
        ...(programOrContext?.block_goal_ids || []),
        ...(programOrContext?.day_goal_ids || []),
    ];
    return new Set(expandProgramGoalIds([
        ...collectProgramGoalIds(programOrContext),
        ...legacyContextSeeds,
    ], childrenById));
}

export function buildProgramRenderScopeGoalIds(treeData, metricScopeGoalIds) {
    const renderIds = new Set([...metricScopeGoalIds].map(String));
    if (!treeData || renderIds.size === 0) return renderIds;

    const { parentById } = buildTreeMaps(treeData);
    [...renderIds].forEach((goalId) => {
        let parentId = parentById.get(goalId);
        while (parentId && !renderIds.has(parentId)) {
            renderIds.add(parentId);
            parentId = parentById.get(parentId);
        }
    });
    const ordered = new Set();
    const stack = [treeData];
    while (stack.length > 0) {
        const goal = stack.pop();
        const goalId = String(goal?.id ?? goal?.attributes?.id ?? '');
        if (renderIds.has(goalId)) ordered.add(goalId);
        [...(goal?.children || [])].reverse().forEach((child) => stack.push(child));
    }
    return ordered;
}
