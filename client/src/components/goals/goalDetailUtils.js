export function getParentGoalInfo({ mode, parentGoal, goal, treeData }) {
  if (mode === 'create' && parentGoal) {
    return {
      name: parentGoal.name,
      type: parentGoal.attributes?.type || parentGoal.type
    };
  }

  const parentId = goal?.attributes?.parent_id;
  if (!parentId || !treeData) return null;

  const findNode = (node, targetId) => {
    if (!node) return null;
    const nodeId = node.id || node.attributes?.id;
    if (nodeId === targetId) return node;
    if (!node.children || node.children.length === 0) return null;

    for (const child of node.children) {
      const found = findNode(child, targetId);
      if (found) return found;
    }
    return null;
  };

  const parentNode = findNode(treeData, parentId);
  if (!parentNode) return null;

  return {
    name: parentNode.name,
    type: parentNode.attributes?.type || parentNode.type
  };
}

/**
 * The goal as currently edited in the detail form, for the live SMART indicator.
 *
 * Pre-computed server status (top-level and legacy `attributes`) is cleared so
 * the SMART helpers recompute from the unsaved form values.
 */
export function buildLiveSmartGoal(goal, {
  description,
  targets,
  associatedActivityIds,
  deadline,
  relevanceStatement,
  completedViaChildren,
  inheritParentActivities,
}) {
  const edits = {
    description,
    targets: Array.isArray(targets) ? targets : [],
    deadline,
    relevance_statement: relevanceStatement,
    completed_via_children: completedViaChildren,
    inherit_parent_activities: inheritParentActivities,
    smart_status: undefined,
    is_smart: undefined,
  };
  return {
    ...goal,
    ...edits,
    attributes: {
      ...goal?.attributes,
      ...edits,
      associated_activity_ids: associatedActivityIds,
    },
  };
}
