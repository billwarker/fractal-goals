export function normalizeGoal(goal) {
    if (!goal) return null;
    const attributes = goal.attributes || {};
    return {
        ...goal,
        id: goal.id || attributes.id,
        name: goal.name || attributes.name || 'Untitled goal',
        type: goal.type || goal.goal_type || attributes.type || attributes.goal_type,
        parent_id: goal.parent_id || goal.parentId || attributes.parent_id || attributes.parentId || null,
        childrenIds: goal.childrenIds || goal.children_ids || attributes.childrenIds || attributes.children_ids || [],
        completed: Boolean(goal.completed || goal.status?.completed || attributes.completed || attributes.status?.completed),
        originalGoal: goal.originalGoal || goal,
    };
}

export function buildChildIdsByParent(goals) {
    const goalIds = new Set(goals.map((goal) => goal.id));
    const map = new Map(goals.map((goal) => [goal.id, []]));
    goals.forEach((goal) => {
        if (goal.parent_id && goalIds.has(goal.parent_id)) map.get(goal.parent_id).push(goal.id);
    });
    goals.forEach((goal) => {
        const explicit = (goal.childrenIds || []).filter((childId) => goalIds.has(childId));
        map.set(goal.id, Array.from(new Set([...(map.get(goal.id) || []), ...explicit])));
    });
    return map;
}

export function collectDescendantIds(goalId, childIdsByParent) {
    const result = [];
    const visited = new Set([goalId]);
    const visit = (currentId) => (childIdsByParent.get(currentId) || []).forEach((childId) => {
        if (visited.has(childId)) return;
        visited.add(childId);
        result.push(childId);
        visit(childId);
    });
    visit(goalId);
    return result;
}

export function collectAncestorIds(goal, goalById) {
    const result = [];
    if (!goal) return result;
    const visited = new Set([goal.id]);
    let parentId = goal.parent_id;
    while (parentId && goalById.has(parentId) && !visited.has(parentId)) {
        visited.add(parentId);
        result.push(parentId);
        parentId = goalById.get(parentId)?.parent_id;
    }
    return result;
}

export function findSelectedDescendant(goalId, goalById, childIdsByParent, selectedIdSet) {
    const visited = new Set([goalId]);
    const visit = (currentId) => {
        for (const childId of childIdsByParent.get(currentId) || []) {
            if (visited.has(childId)) continue;
            visited.add(childId);
            if (selectedIdSet.has(String(childId))) return goalById.get(childId) || null;
            const nestedMatch = visit(childId);
            if (nestedMatch) return nestedMatch;
        }
        return null;
    };
    return visit(goalId);
}

export function findSelectedAncestor(goal, goalById, selectedIdSet) {
    const visited = new Set([goal.id]);
    let parentId = goal.parent_id;
    while (parentId && goalById.has(parentId) && !visited.has(parentId)) {
        visited.add(parentId);
        const parentGoal = goalById.get(parentId);
        if (selectedIdSet.has(String(parentId))) return parentGoal;
        parentId = parentGoal?.parent_id;
    }
    return null;
}

export function filterGoalsForSearch(goals, query) {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return goals;
    const goalById = new Map(goals.map((goal) => [goal.id, goal]));
    const includedIds = new Set();
    goals.forEach((goal) => {
        const typeLabel = (goal.type || '').replace(/([A-Z])/g, ' $1').trim();
        if (!goal.name.toLowerCase().includes(trimmed) && !typeLabel.toLowerCase().includes(trimmed)) return;
        includedIds.add(goal.id);
        let parentId = goal.parent_id;
        const seen = new Set([goal.id]);
        while (parentId && goalById.has(parentId) && !seen.has(parentId)) {
            includedIds.add(parentId);
            seen.add(parentId);
            parentId = goalById.get(parentId)?.parent_id;
        }
    });
    return goals.filter((goal) => includedIds.has(goal.id));
}
