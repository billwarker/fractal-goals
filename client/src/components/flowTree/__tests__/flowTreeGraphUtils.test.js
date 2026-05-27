import { buildGraphPresentation } from '../flowTreeGraphUtils';

describe('buildGraphPresentation', () => {
    it('defaults FlowTree presentation nodes to tree layout mode', () => {
        const treeData = {
            id: 'root-1',
            name: 'Root Goal',
            type: 'UltimateGoal',
            children: [
                {
                    id: 'goal-1',
                    name: 'Child Goal',
                    type: 'LongTermGoal',
                    children: [],
                },
            ],
        };

        const graph = buildGraphPresentation({
            treeData,
            onNodeClick: () => {},
            onAddChild: () => {},
            selectedNodeId: null,
            completedGoalColor: '#FFD700',
            viewSettings: {},
            sessions: [],
            activities: [],
            activityGroups: [],
            programs: [],
            isMobile: false,
        });

        expect(graph.nodes.every((node) => node.data.layoutMode === 'tree')).toBe(true);
        expect(graph.edges.some((edge) => edge.type === 'step')).toBe(false);
    });

    it('dims paused goals when fade inactive branches is enabled even without recent evidence', () => {
        const treeData = {
            id: 'root-1',
            name: 'Root Goal',
            type: 'UltimateGoal',
            children: [
                {
                    id: 'goal-1',
                    name: 'Paused Goal',
                    type: 'LongTermGoal',
                    paused: true,
                    children: [],
                },
            ],
        };

        const graph = buildGraphPresentation({
            treeData,
            onNodeClick: () => {},
            onAddChild: () => {},
            selectedNodeId: null,
            completedGoalColor: '#FFD700',
            viewSettings: { fadeInactiveBranches: true },
            sessions: [],
            activities: [],
            activityGroups: [],
            programs: [],
            isMobile: false,
        });

        const pausedNode = graph.nodes.find((node) => node.id === 'goal-1');
        const pausedEdge = graph.edges.find((edge) => edge.target === 'goal-1');

        expect(pausedNode?.style?.opacity).toBe(0.34);
        expect(pausedEdge?.style?.opacity).toBe(0.26);
    });

    it('hides inactive goals while keeping active lineage visible', () => {
        const treeData = {
            id: 'root-1',
            name: 'Root Goal',
            type: 'UltimateGoal',
            children: [
                {
                    id: 'active-parent',
                    name: 'Active Parent',
                    type: 'LongTermGoal',
                    children: [
                        {
                            id: 'active-leaf',
                            name: 'Active Leaf',
                            type: 'MidTermGoal',
                            children: [],
                        },
                    ],
                },
                {
                    id: 'inactive-goal',
                    name: 'Inactive Goal',
                    type: 'LongTermGoal',
                    children: [],
                },
            ],
        };

        const graph = buildGraphPresentation({
            treeData,
            onNodeClick: () => {},
            onAddChild: () => {},
            selectedNodeId: null,
            completedGoalColor: '#FFD700',
            viewSettings: { hideInactiveGoals: true },
            sessions: [],
            evidenceGoalIds: new Set(['active-leaf']),
            activities: [],
            activityGroups: [],
            programs: [],
            isMobile: false,
        });

        expect(graph.nodes.map((node) => node.id)).toEqual([
            'root-1',
            'active-parent',
            'active-leaf',
        ]);
        expect(graph.edges.find((edge) => edge.target === 'inactive-goal')).toBeUndefined();
    });

    it('highlights active lineage edges and adds a visible journey-to-root overlay', () => {
        const treeData = {
            id: 'root-1',
            name: 'Root Goal',
            type: 'UltimateGoal',
            children: [
                {
                    id: 'goal-1',
                    name: 'Active Goal',
                    type: 'LongTermGoal',
                    children: [],
                },
            ],
        };

        const graph = buildGraphPresentation({
            treeData,
            onNodeClick: () => {},
            onAddChild: () => {},
            selectedNodeId: null,
            completedGoalColor: '#FFD700',
            viewSettings: {},
            sessions: [],
            evidenceGoalIds: new Set(['goal-1']),
            activities: [],
            activityGroups: [],
            programs: [],
            isMobile: false,
        });

        const activeEdge = graph.edges.find((edge) => edge.id === 'root-1-goal-1');
        const activeOverlay = graph.edges.find((edge) => edge.id === 'root-1-goal-1-active-flow');
        const root = graph.nodes.find((node) => node.id === 'root-1');
        const child = graph.nodes.find((node) => node.id === 'goal-1');

        expect(activeEdge?.type).toBe('treeCenter');
        expect(activeEdge?.data?.sourceCenter).toEqual({
            x: root.position.x + 15,
            y: root.position.y + 15,
        });
        expect(activeEdge?.data?.targetCenter).toEqual({
            x: child.position.x + 15,
            y: child.position.y + 15,
        });
        expect(activeEdge?.className).toContain('active-branch-edge');
        expect(activeEdge?.style?.stroke).toBe('var(--color-active-branch-line, #60a5fa)');
        expect(activeEdge?.style?.strokeWidth).toBe(2.25);
        expect(activeEdge?.style?.opacity).toBe(0.88);
        expect(activeOverlay?.className).toContain('active-branch-flow-edge');
        expect(activeOverlay?.className).toContain('journey-edge-to-root');
        expect(activeOverlay?.style?.stroke).toBe('var(--color-active-branch-line, #60a5fa)');
        expect(activeOverlay?.style?.strokeDasharray).toBe('7 15');
        expect(activeOverlay?.style?.opacity).toBe(0.58);
    });

    it('does not derive active evidence locally when backend evidence is absent', () => {
        const treeData = {
            id: 'root-1',
            name: 'Root Goal',
            type: 'UltimateGoal',
            children: [
                {
                    id: 'goal-1',
                    name: 'Mapped Goal',
                    type: 'LongTermGoal',
                    children: [],
                },
            ],
        };

        const graph = buildGraphPresentation({
            treeData,
            onNodeClick: () => {},
            onAddChild: () => {},
            selectedNodeId: null,
            completedGoalColor: '#FFD700',
            viewSettings: {},
            sessions: [
                {
                    activity_instances: [
                        {
                            completed: true,
                            activity_definition_id: 'activity-1',
                            time_stop: new Date().toISOString(),
                        },
                    ],
                },
            ],
            activities: [{ id: 'activity-1', associated_goal_ids: ['goal-1'] }],
            activityGroups: [],
            programs: [],
            isMobile: false,
        });

        const edge = graph.edges.find((entry) => entry.id === 'root-1-goal-1');
        expect(edge?.className || '').not.toContain('active-branch-edge');
    });

    it('uses the completed color for active branches connecting two completed goals', () => {
        const treeData = {
            id: 'root-1',
            name: 'Root Goal',
            type: 'UltimateGoal',
            completed: true,
            children: [
                {
                    id: 'goal-1',
                    name: 'Completed Active Goal',
                    type: 'LongTermGoal',
                    completed: true,
                    children: [],
                },
            ],
        };

        const graph = buildGraphPresentation({
            treeData,
            onNodeClick: () => {},
            onAddChild: () => {},
            selectedNodeId: null,
            completedGoalColor: '#facc15',
            viewSettings: {},
            sessions: [],
            evidenceGoalIds: new Set(['goal-1']),
            activities: [],
            activityGroups: [],
            programs: [],
            isMobile: false,
        });

        const activeEdge = graph.edges.find((edge) => edge.id === 'root-1-goal-1');
        const activeOverlay = graph.edges.find((edge) => edge.id === 'root-1-goal-1-active-flow');

        expect(activeEdge?.className).toContain('completed-edge');
        expect(activeEdge?.className).toContain('active-branch-edge');
        expect(activeEdge?.style?.stroke).toBe('#facc15');
        expect(activeEdge?.style?.['--active-branch-highlight-color']).toBe('#facc15');
        expect(activeOverlay?.style?.stroke).toBe('#facc15');
        expect(activeOverlay?.style?.['--active-branch-highlight-color']).toBe('#facc15');
    });

    it('can arrange the same FlowTree nodes in hierarchy layout mode', () => {
        const treeData = {
            id: 'root-1',
            name: 'Root Goal',
            type: 'UltimateGoal',
            children: [
                {
                    id: 'parent-1',
                    name: 'Parent Goal',
                    type: 'LongTermGoal',
                    children: [
                        {
                            id: 'child-1',
                            name: 'Child Goal',
                            type: 'MidTermGoal',
                            children: [],
                        },
                    ],
                },
            ],
        };

        const graph = buildGraphPresentation({
            treeData,
            onNodeClick: () => {},
            onAddChild: () => {},
            selectedNodeId: null,
            completedGoalColor: '#FFD700',
            viewSettings: {},
            sessions: [],
            activities: [],
            activityGroups: [],
            programs: [],
            isMobile: false,
            layoutMode: 'hierarchy',
        });

        const root = graph.nodes.find((node) => node.id === 'root-1');
        const parent = graph.nodes.find((node) => node.id === 'parent-1');
        const child = graph.nodes.find((node) => node.id === 'child-1');

        expect(parent.position.x).toBeGreaterThan(root.position.x);
        expect(child.position.x).toBeGreaterThan(parent.position.x);
        expect(parent.position.y).toBeGreaterThan(root.position.y);
        expect(child.position.y).toBeGreaterThan(parent.position.y);
        expect(graph.edges.every((edge) => edge.type === 'step')).toBe(true);
    });
});
