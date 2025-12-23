# 🔍 Debugging Edge Visibility Issue

## Problem
Edges (connection lines) are not visible in ReactFlow despite configuration.

## Debugging Steps

### 1. Check Browser Console
Open browser console (F12) and look for:
- "FlowTree - Nodes: X" 
- "FlowTree - Edges: X"
- "FlowTree - Edges array: [...]"

**Expected:**
- Nodes count should match your goal count
- Edges count should be (nodes - 1) for a tree
- Edges array should have objects with source/target

**If edges = 0:**
- Tree structure issue
- Children not being traversed
- Parent-child relationship broken

### 2. Check ReactFlow Rendering
In browser console, run:
```javascript
document.querySelectorAll('.react-flow__edge').length
```

**Expected:** Should match edges count

**If 0:**
- ReactFlow not rendering edges
- CSS hiding them
- Edge data format issue

### 3. Possible Issues

**A. Node ID Mismatch**
- Source/target IDs don't match actual node IDs
- Check: `node.id` vs `node.attributes?.id`

**B. Edge Type Not Supported**
- 'straight' type might not exist
- Try: 'default', 'step', 'smoothstep'

**C. CSS Override**
- ReactFlow CSS hiding edges
- Background color same as edge color

**D. Z-Index Issue**
- Edges behind background
- Edges behind nodes

### 4. Quick Fixes to Try

**Option 1: Use default edge type**
```javascript
type: 'default'  // instead of 'straight'
```

**Option 2: Add edge label (makes them visible)**
```javascript
label: '→',
labelStyle: { fill: '#fff' }
```

**Option 3: Different color**
```javascript
stroke: '#ff0000'  // Red for testing
```

**Option 4: Check if edges exist**
```javascript
// In convertTreeToFlow, before return:
if (edges.length === 0) {
  console.error('NO EDGES CREATED!');
}
```

### 5. Alternative: Force Edge Creation

If tree traversal is broken, manually create edges:
```javascript
// After traverse, manually add edges
nodes.forEach((node, i) => {
  if (i > 0) {
    edges.push({
      id: `edge-${i}`,
      source: nodes[0].id,
      target: node.id,
      type: 'default',
      style: { stroke: '#ff0000', strokeWidth: 5 }
    });
  }
});
```

## Next Steps

1. **Check console logs** - Are edges being created?
2. **Try red color** - `stroke: '#ff0000'` to rule out visibility
3. **Try default type** - `type: 'default'` instead of 'straight'
4. **Inspect DOM** - Are `.react-flow__edge` elements present?

---

**Most Likely Issue:** Edge type 'straight' might not be valid in this version of ReactFlow. Try 'default' or 'step' instead.
