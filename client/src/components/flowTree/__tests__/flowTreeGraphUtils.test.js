import { buildGraphPresentation } from '../flowTreeGraphUtils';

describe('buildGraphPresentation', () => {
    it('dims frozen goals when fade inactive branches is enabled even without recent evidence', () => {
        const treeData = {
            id: 'root-1',
            name: 'Root Goal',
            type: 'UltimateGoal',
            children: [
                {
                    id: 'goal-1',
                    name: 'Frozen Goal',
                    type: 'LongTermGoal',
                    frozen: true,
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

        const frozenNode = graph.nodes.find((node) => node.id === 'goal-1');
        const frozenEdge = graph.edges.find((edge) => edge.target === 'goal-1');

        expect(frozenNode?.style?.opacity).toBe(0.34);
        expect(frozenEdge?.style?.opacity).toBe(0.26);
    });
});
