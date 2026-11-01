/**
 * The goal-level rank Time Spent Per Goal stacks by (0 is the top level), or null for automatic.
 * Saved views from before levels: "Roll up to root" becomes the top level; the rest are automatic.
 */
export function timeDistributionRollupRank(state = {}) {
    if (Number.isInteger(state.rollupRank)) return state.rollupRank;
    return state.inheritanceMode === 'root' ? 0 : null;
}
