import { buildPlanGoalsView, planGoalsViewHasGoal, planSectionActivityIds } from '../planGoalsView';

const tree = {
    id: 'root', name: 'Handstand', children: [
        { id: 'lt', name: 'Strength', children: [
            { id: 'mt', name: 'Front lever', children: [{ id: 'st', name: 'Tuck', children: [] }] },
            { id: 'mt2', name: 'Push', children: [] },
        ] },
        { id: 'other', name: 'Flexibility', children: [{ id: 'pancake', name: 'Pancake', children: [] }] },
    ],
};
const activities = [
    { id: 'fl', name: 'Adv. Tuck FL Holds', associated_goal_ids: ['st'], group_id: 'g' },
    { id: 'pike', name: 'Pike Push Ups', associated_goal_ids: [] , group_id: 'g2' },
    { id: 'gone', name: 'Goal outside tree', associated_goal_ids: ['deleted-goal'] },
];
const activityGroups = [{ id: 'g', associated_goal_ids: [] }, { id: 'g2', associated_goal_ids: ['mt2'] }];
const ids = (node) => [node.id, ...(node.children || []).flatMap(ids)];

describe('planSectionActivityIds', () => {
    it('lists activities once, counting circuit members', () => {
        const circuitById = new Map([['circ', { slots: [{ activity_definition_id: 'fl' }, { activity_definition_id: 'pike' }] }]]);
        expect(planSectionActivityIds([
            { items: [{ type: 'activity', activity_definition_id: 'fl' }, { type: 'circuit', circuit_definition_id: 'circ' }] },
            { items: [{ type: 'activity', activity_id: 'legacy' }, { type: 'circuit', circuit_definition_id: 'missing' }] },
        ], circuitById)).toEqual(['fl', 'legacy', 'pike']);
        expect(planSectionActivityIds([], circuitById)).toEqual([]);
    });
});

describe('buildPlanGoalsView', () => {
    it('keeps scope goals, activity goals, their ancestors, and the root, as the session view does', () => {
        const view = buildPlanGoalsView({
            goalTree: tree, scopeGoalIds: ['mt'], activityIds: ['fl', 'pike'], activities, activityGroups,
        });

        expect(ids(view.goal_tree)).toEqual(['root', 'lt', 'mt', 'st', 'mt2']);
        expect(view.manual_goal_ids).toEqual(['mt']);
        expect(view.automatic_goal_ids).toEqual(['mt2', 'st']);
        expect(view.activity_goal_ids_by_activity).toEqual({ fl: ['st'], pike: ['mt2'] });
        expect(view.session_activity_ids).toEqual(['fl', 'pike']);
    });

    it('drops goals that are not in the tree, and shows only the root for an empty plan', () => {
        const view = buildPlanGoalsView({
            goalTree: tree, scopeGoalIds: ['deleted-goal'], activityIds: ['gone'], activities, activityGroups,
        });

        expect(ids(view.goal_tree)).toEqual(['root']);
        expect(view.manual_goal_ids).toEqual([]);
        expect(view.activity_goal_ids_by_activity).toEqual({ gone: [] });
        expect(buildPlanGoalsView({ goalTree: null })).toBeNull();
    });

    it("follows an unsaved draft: an added activity's goals join the hierarchy", () => {
        const before = buildPlanGoalsView({ goalTree: tree, scopeGoalIds: [], activityIds: ['fl'], activities, activityGroups });
        const after = buildPlanGoalsView({ goalTree: tree, scopeGoalIds: [], activityIds: ['fl', 'pike'], activities, activityGroups });

        expect(planGoalsViewHasGoal(before, 'mt2')).toBe(false);
        expect(planGoalsViewHasGoal(after, 'mt2')).toBe(true);
        expect(planGoalsViewHasGoal(after, 'pancake')).toBe(false);
        expect(planGoalsViewHasGoal(null, 'mt2')).toBe(false);
    });
});
