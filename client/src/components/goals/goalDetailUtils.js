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
