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
