const toId = (value) => (value == null ? null : String(value));

export const getLineagePath = (treeData, targetNodeId) => {
    const lineageIds = new Set();

    const findNodeAndAncestors = (node, targetId, currentPath = []) => {
        if (!node) return null;

        const nodeId = toId(node.id || node.attributes?.id);
        if (!nodeId) return null;

        const newPath = [...currentPath, nodeId];
        if (nodeId === targetId) {
            return { node, path: newPath };
        }

        if (Array.isArray(node.children) && node.children.length > 0) {
            for (const child of node.children) {
                const result = findNodeAndAncestors(child, targetId, newPath);
                if (result) return result;
            }
        }

        return null;
    };

    const collectDescendants = (node, descendants = new Set()) => {
        if (!node) return descendants;

        const nodeId = toId(node.id || node.attributes?.id);
        if (nodeId) descendants.add(nodeId);

        if (Array.isArray(node.children) && node.children.length > 0) {
            node.children.forEach((child) => collectDescendants(child, descendants));
        }

        return descendants;
    };

    const result = findNodeAndAncestors(treeData, toId(targetNodeId));
    if (result) {
        result.path.forEach((id) => lineageIds.add(id));
        collectDescendants(result.node, lineageIds);
    }

    return lineageIds;
};

/**
 * The flow tree while a goal is being sequenced: its ancestors, itself, and its same-level
 * siblings, the goals it can share a sequence with. No goal's children are included.
 */
export const getSequencingScope = (treeData, targetNodeId) => {
    const targetId = toId(targetNodeId);
    const readLevel = (node) => node?.level_id ?? node?.attributes?.level_id ?? null;
    const find = (node, path = []) => {
        const nodeId = toId(node?.id || node?.attributes?.id);
        if (!nodeId) return null;
        if (nodeId === targetId) return { node, path: [...path, node] };
        for (const child of node.children || []) {
            const result = find(child, [...path, node]);
            if (result) return result;
        }
        return null;
    };

    const result = find(treeData);
    if (!result) return new Set();
    const scopeIds = new Set(result.path.map((node) => toId(node.id || node.attributes?.id)));
    const parent = result.path[result.path.length - 2];
    const levelId = readLevel(result.node);
    (parent?.children || []).forEach((sibling) => {
        if (readLevel(sibling) === levelId) scopeIds.add(toId(sibling.id || sibling.attributes?.id));
    });
    return scopeIds;
};

/**
 * Overlay a drafted sequence on the goal tree so the flow tree previews it before it's saved.
 * Drafted steps take positions 1..n; goals that left the edited track lose theirs. A draft of
 * fewer than two goals is no sequence, so it only clears the edited track.
 */
export const applySequenceDraft = (treeData, draft) => {
    if (!treeData || !draft) return treeData;
    const draftTrackId = draft.trackId || 'draft-sequence';
    const positions = new Map((draft.stepIds?.length >= 2 ? draft.stepIds : []).map((id, index) => [toId(id), index + 1]));
    const withSequence = (node, trackId, position) => {
        const fields = { sequence_track_id: trackId, sequence_position: position };
        return { ...node, ...fields, ...(node.attributes ? { attributes: { ...node.attributes, ...fields } } : {}) };
    };
    const visit = (node) => {
        if (!node) return node;
        const nodeId = toId(node.id || node.attributes?.id);
        const trackId = toId(node.sequence_track_id ?? node.attributes?.sequence_track_id);
        let next = node;
        if (positions.has(nodeId)) next = withSequence(node, draftTrackId, positions.get(nodeId));
        else if (draft.trackId && trackId === toId(draft.trackId)) next = withSequence(node, null, null);
        const children = Array.isArray(node.children) ? node.children.map(visit) : node.children;
        const childrenChanged = Array.isArray(node.children) && children.some((child, index) => child !== node.children[index]);
        if (next === node && !childrenChanged) return node;
        return { ...next, children };
    };
    return visit(treeData);
};

export const getGoalLineageScope = (treeData, targetNodeIds = []) => {
    const scopeIds = new Set();

    (targetNodeIds || []).forEach((targetNodeId) => {
        getLineagePath(treeData, targetNodeId).forEach((goalId) => scopeIds.add(goalId));
    });

    return scopeIds;
};

export const buildTreeMaps = (treeData) => {
    const parentById = new Map();
    const childrenById = new Map();
    const nodeById = new Map();
    const completedGoals = [];

    const traverse = (node, parentId = null) => {
        if (!node) return;
        const nodeId = toId(node.id || node.attributes?.id);
        if (!nodeId) return;

        nodeById.set(nodeId, node);
        if (!childrenById.has(nodeId)) childrenById.set(nodeId, []);
        if (parentId) {
            parentById.set(nodeId, parentId);
            const siblings = childrenById.get(parentId) || [];
            siblings.push(nodeId);
            childrenById.set(parentId, siblings);
        }

        const completedAt = node.attributes?.completed_at || node.completed_at;
        const completed = Boolean(node.attributes?.completed || node.completed);
        if (completed && completedAt) {
            const timestamp = Date.parse(completedAt);
            if (!Number.isNaN(timestamp)) {
                completedGoals.push({ id: nodeId, completedAt, timestamp });
            }
        }

        if (Array.isArray(node.children) && node.children.length > 0) {
            node.children.forEach((child) => traverse(child, nodeId));
        }
    };

    traverse(treeData);
    completedGoals.sort((a, b) => a.timestamp - b.timestamp);

    return { parentById, childrenById, nodeById, completedGoals };
};

export const sortChildren = (children, sortBy) => {
    if (!children || !Array.isArray(children)) return [];
    const sorted = [...children];

    switch (sortBy) {
        case 'deadline':
            return sorted.sort((a, b) => {
                const aDate = a.attributes?.deadline || a.deadline;
                const bDate = b.attributes?.deadline || b.deadline;
                if (!aDate && !bDate) return 0;
                if (!aDate) return 1;
                if (!bDate) return -1;
                return new Date(aDate) - new Date(bDate);
            });
        case 'created_at':
            return sorted.sort((a, b) => {
                const aDate = a.attributes?.created_at || a.created_at;
                const bDate = b.attributes?.created_at || b.created_at;
                if (!aDate && !bDate) return 0;
                if (!aDate) return 1;
                if (!bDate) return -1;
                return new Date(aDate) - new Date(bDate);
            });
        case 'completion_rate':
            return sorted.sort((a, b) => {
                const aComp = a.attributes?.completed || a.completed ? 1 : 0;
                const bComp = b.attributes?.completed || b.completed ? 1 : 0;
                if (aComp !== bComp) return bComp - aComp;

                const aDate = a.attributes?.created_at || a.created_at;
                const bDate = b.attributes?.created_at || b.created_at;
                if (!aDate || !bDate) return 0;
                return new Date(aDate) - new Date(bDate);
            });
        case 'manual':
            return sorted;
        default:
            return sorted;
    }
};
