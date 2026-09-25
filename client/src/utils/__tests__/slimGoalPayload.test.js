/**
 * Contract: client helpers must work with the slim goal payload, where the
 * server no longer duplicates top-level fields inside `attributes` and no
 * longer embeds per-goal `level_characteristics`.
 */
import { buildGraphPresentation } from '../../components/flowTree/flowTreeGraphUtils';
import {
    getGoalNodeDescription,
    getGoalNodeId,
    getGoalNodeType,
    normalizeGoalNode,
} from '../goalNodeModel';
import { calculateMetrics } from '../metricsHelpers';
import { calculateSMARTStatus, isSMART } from '../smartHelpers';

const slimGoal = (overrides = {}) => ({
    id: 'goal-1',
    name: 'Slim goal',
    type: 'ShortTermGoal',
    level_id: 'level-short',
    description: 'Top-level description',
    deadline: '2026-12-01T00:00:00Z',
    completed: false,
    completed_at: null,
    is_smart: false,
    // relevant: true comes from the server (e.g. inherited context) although relevance_statement is empty.
    smart_status: { specific: true, measurable: false, achievable: true, relevant: true, time_bound: true },
    paused: false,
    paused_at: null,
    attributes: {
        parent_id: 'root',
        root_id: 'root',
        targets: [],
        relevance_statement: '',
        associated_activity_ids: ['activity-1'],
        associated_activity_group_ids: [],
    },
    children: [],
    ...overrides,
});

describe('slim goal payload contract', () => {
    it('reads identity and descriptive fields from the top level', () => {
        const goal = slimGoal();

        expect(getGoalNodeId(goal)).toBe('goal-1');
        expect(getGoalNodeType(goal)).toBe('ShortTermGoal');
        expect(getGoalNodeDescription(goal)).toBe('Top-level description');
        expect(normalizeGoalNode(goal)).toMatchObject({
            deadline: '2026-12-01T00:00:00Z',
            completed: false,
            level_id: 'level-short',
            is_smart: false,
        });
    });

    it('prefers top-level values over stale legacy attributes', () => {
        const goal = slimGoal({ attributes: { ...slimGoal().attributes, id: 'legacy', type: 'LegacyType' } });

        expect(getGoalNodeId(goal)).toBe('goal-1');
        expect(getGoalNodeType(goal)).toBe('ShortTermGoal');
    });

    it('still reads legacy attributes-only goals', () => {
        const legacy = { attributes: { id: 'legacy-1', type: 'ImmediateGoal', description: 'Legacy' } };

        expect(getGoalNodeId(legacy)).toBe('legacy-1');
        expect(getGoalNodeType(legacy)).toBe('ImmediateGoal');
        expect(getGoalNodeDescription(legacy)).toBe('Legacy');
    });

    it('uses the server SMART status rather than recomputing from partial attributes', () => {
        const goal = slimGoal();

        expect(isSMART(goal)).toBe(false);
        expect(isSMART(slimGoal({ is_smart: true }))).toBe(true);
        expect(calculateSMARTStatus(goal)).toEqual({
            specific: true, measurable: false, achievable: true, relevant: true, timeBound: true,
        });
    });

    it('counts completion and deadlines from top-level fields', () => {
        const tree = slimGoal({
            id: 'root',
            completed: true,
            children: [slimGoal({ id: 'child', completed: false, deadline: '2020-01-01T00:00:00Z' })],
        });

        const metrics = calculateMetrics(tree);

        expect(metrics.totalGoals).toBe(2);
        expect(metrics.completedGoals).toBe(1);
        expect(metrics.totalDeadlines).toBe(2);
    });

    it('sorts children with the level resolver when levels are not embedded', () => {
        const children = [
            ['c-goal', '2026-03-01T00:00:00Z'],
            ['a-goal', '2026-01-01T00:00:00Z'],
            ['b-goal', '2026-02-01T00:00:00Z'],
        ].map(([id, deadline]) => slimGoal({ id, name: id, type: 'ImmediateGoal', deadline }));
        const treeData = slimGoal({ id: 'root', type: 'UltimateGoal', children });
        const childOrder = (getSortChildrenBy) => buildGraphPresentation({
            treeData,
            onNodeClick: () => {},
            onAddChild: () => {},
            selectedNodeId: null,
            completedGoalColor: '#FFD700',
            viewSettings: {},
            activities: [],
            activityGroups: [],
            programs: [],
            isMobile: false,
            getSortChildrenBy,
        }).nodes.map((node) => node.id).filter((id) => id.endsWith('-goal'));

        expect(childOrder((node) => (node.id === 'root' ? 'deadline' : null))).toEqual(['a-goal', 'b-goal', 'c-goal']);
        expect(childOrder(null)).not.toEqual(['a-goal', 'b-goal', 'c-goal']);
    });
});
