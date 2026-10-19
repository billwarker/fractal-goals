// @ts-check

/**
 * Hide completed goals from a flattened hierarchy without breaking its structure: a completed
 * goal stays while it still has an open descendant in the list, so open work keeps its lineage.
 * @template {{ id: any, parent_id?: any, completed?: boolean, status?: { completed?: boolean } }} T
 * @param {T[]} nodes
 * @returns {T[]}
 */
export function hideCompletedBranches(nodes) {
    const byId = new Map(nodes.map((node) => [String(node.id), node]));
    const keep = new Set();
    nodes.forEach((node) => {
        if (node.status ? node.status.completed : node.completed) return;
        // An open goal keeps itself and every ancestor in the list.
        let current = /** @type {T | undefined} */ (node);
        while (current && !keep.has(String(current.id))) {
            keep.add(String(current.id));
            current = current.parent_id == null ? undefined : byId.get(String(current.parent_id));
        }
    });
    return nodes.filter((node) => keep.has(String(node.id)));
}
