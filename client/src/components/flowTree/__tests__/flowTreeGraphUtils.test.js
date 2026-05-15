import { buildGraphPresentation } from '../flowTreeGraphUtils';

describe('buildGraphPresentation', () => {
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
});
