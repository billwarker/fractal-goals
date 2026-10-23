import { buildGraphPresentation } from '../flowTreeGraphUtils';
import { applySequenceDraft, getSequencingScope } from '../flowTreeTreeUtils';

describe('sequence arrows', () => {
    const step = (id, position, overrides = {}) => ({
        id, name: id, type: 'MidTermGoal', sequence_track_id: 'track-1', sequence_position: position, children: [], ...overrides,
    });
    const tree = (children) => ({ id: 'root', name: 'Root', type: 'LongTermGoal', children });
    const build = (treeData, extra = {}) => buildGraphPresentation({
        treeData, onNodeClick: () => {}, onAddChild: null, selectedNodeId: null,
        completedGoalColor: '#FFD700', viewSettings: {}, programs: [], isMobile: false, ...extra,
    });

    it('orders steps together by position and links consecutive steps with dashed arrows', () => {
        const graph = build(tree([step('c', 3), { id: 'other', name: 'Other', type: 'MidTermGoal', children: [] }, step('a', 1), step('b', 2)]));

        expect(graph.nodes.map((node) => node.id)).toEqual(['root', 'a', 'b', 'c', 'other']);
        const arrows = graph.edges.filter((edge) => edge.type === 'sequence');
        expect(arrows.map((edge) => [edge.source, edge.target])).toEqual([['a', 'b'], ['b', 'c']]);
        expect(arrows[0].style.strokeDasharray).toBe('5 5');
        expect(arrows[0].markerEnd).toMatchObject({ type: 'arrowclosed' });
        const source = graph.nodes.find((node) => node.id === arrows[0].source);
        // The arrow runs between the step-number badges, which sit left of each node's icon.
        expect(arrows[0].data.sourceBox).toMatchObject({ x: source.position.x - 14, halfWidth: 8, halfHeight: 8 });
    });

    it('never changes node positions', () => {
        const sequenced = build(tree([step('a', 1), step('b', 2), step('c', 3)]));
        const plain = build(tree(['a', 'b', 'c'].map((id) => ({ id, name: id, type: 'MidTermGoal', children: [] }))));

        expect(sequenced.nodes.map((node) => [node.id, node.position])).toEqual(plain.nodes.map((node) => [node.id, node.position]));
    });

    it('skips hidden steps and the hierarchy layout', () => {
        const withHidden = build(tree([step('a', 1, { completed: true }), step('b', 2), step('c', 3)]), {
            viewSettings: { hideCompletedGoals: true },
        });
        expect(withHidden.edges.filter((edge) => edge.type === 'sequence').map((edge) => [edge.source, edge.target]))
            .toEqual([['b', 'c']]);

        const hierarchy = build(tree([step('a', 1), step('b', 2)]), { layoutMode: 'hierarchy' });
        expect(hierarchy.edges.some((edge) => edge.type === 'sequence')).toBe(false);
    });
});

describe('sequencing focus', () => {
    it('shows the goal, its ancestors and same-level siblings, without any children', () => {
        const leaf = (id) => ({ id, name: id, type: 'ImmediateGoal', level_id: 'immediate', children: [] });
        const short = (id, children = []) => ({ id, name: id, type: 'ShortTermGoal', level_id: 'short', children });
        const treeData = {
            id: 'root', name: 'Root', type: 'UltimateGoal', level_id: 'ultimate',
            children: [{
                id: 'parent', name: 'Parent', type: 'MidTermGoal', level_id: 'mid',
                children: [short('target', [leaf('target-child')]), short('sibling', [leaf('sibling-child')]), leaf('other-level')],
            }, { id: 'uncle', name: 'Uncle', type: 'MidTermGoal', level_id: 'mid', children: [short('cousin')] }],
        };

        const graph = buildGraphPresentation({
            treeData,
            onNodeClick: () => {},
            onAddChild: () => {},
            selectedNodeId: 'target',
            focusGoalIds: getSequencingScope(treeData, 'target'),
            completedGoalColor: '#FFD700',
            viewSettings: {},
            programs: [],
            isMobile: false,
        });

        expect(graph.nodes.map((node) => node.id).sort()).toEqual(['parent', 'root', 'sibling', 'target']);
    });
});

describe('applySequenceDraft', () => {
    const goal = (id, extra = {}) => ({ id, name: id, children: [], ...extra });
    const tree = () => ({
        id: 'root',
        children: [{
            id: 'parent',
            children: [
                goal('a', { sequence_track_id: 't', sequence_position: 1 }),
                goal('b', { sequence_track_id: 't', sequence_position: 2 }),
                goal('c'),
            ],
        }, goal('untouched')],
    });
    const sequenceOf = (data) => Object.fromEntries(data.children[0].children.map((node) => [node.id, [node.sequence_track_id, node.sequence_position]]));

    it('previews a reordered and extended track without touching unrelated branches', () => {
        const original = tree();
        const preview = applySequenceDraft(original, { trackId: 't', stepIds: ['c', 'a'] });

        expect(sequenceOf(preview)).toEqual({ a: ['t', 2], b: [null, null], c: ['t', 1] });
        expect(preview.children[1]).toBe(original.children[1]);
        expect(sequenceOf(original)).toEqual({ a: ['t', 1], b: ['t', 2], c: [undefined, undefined] });
    });

    it('previews a new sequence once it has two goals', () => {
        expect(applySequenceDraft(tree(), { trackId: null, stepIds: ['c'] }).children[0].children[2].sequence_track_id).toBeUndefined();
        const preview = applySequenceDraft(tree(), { trackId: null, stepIds: ['c', 'b'] });
        expect(preview.children[0].children[2]).toMatchObject({ sequence_track_id: 'draft-sequence', sequence_position: 1 });
    });
});
