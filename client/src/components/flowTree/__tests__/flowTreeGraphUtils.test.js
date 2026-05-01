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
});
