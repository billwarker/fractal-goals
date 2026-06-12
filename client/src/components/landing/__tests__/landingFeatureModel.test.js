import { describe, expect, it } from 'vitest';

import {
    buildActivityLineage,
    overlapsDateWindow,
    resolveFeaturedActivities,
    resolveFeaturedCharts,
    resolveFeaturedProgram,
    resolveFeaturedSession,
} from '../landingFeatureModel';

const tree = {
    id: 'root',
    name: 'Root',
    type: 'UltimateGoal',
    attributes: { id: 'root', type: 'UltimateGoal' },
    children: [
        {
            id: 'long',
            name: 'Long term',
            type: 'LongTermGoal',
            attributes: { id: 'long', type: 'LongTermGoal' },
            children: [
                {
                    id: 'short',
                    name: 'Short term',
                    type: 'ShortTermGoal',
                    attributes: {
                        id: 'short',
                        type: 'ShortTermGoal',
                        associated_activity_ids: ['activity-1'],
                    },
                    children: [],
                },
            ],
        },
        {
            id: 'other-branch',
            name: 'Unrelated branch',
            type: 'LongTermGoal',
            attributes: { id: 'other-branch', type: 'LongTermGoal' },
            children: [],
        },
    ],
};

const baseExample = {
    tree,
    sessions: [{ id: 's1', name: 'Recent' }, { id: 's2', name: 'Older' }],
    activityDefinitions: [
        { id: 'activity-1', name: 'Linked', associated_goal_ids: ['short'] },
        { id: 'activity-2', name: 'Unlinked', associated_goal_ids: [] },
    ],
    programs: [{ id: 'p1', name: 'Program One' }, { id: 'p2', name: 'Program Two' }],
    analyticsCharts: [{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two' }],
    showcase: null,
};

describe('landingFeatureModel v4 fallbacks (showcase null)', () => {
    it('falls back to the first session', () => {
        expect(resolveFeaturedSession(baseExample).id).toBe('s1');
    });

    it('prefers goal-linked activities', () => {
        expect(resolveFeaturedActivities(baseExample).map((a) => a.id)).toEqual(['activity-1']);
    });

    it('falls back to the first program with no window', () => {
        const { program, windowStart, windowEnd } = resolveFeaturedProgram(baseExample);
        expect(program.id).toBe('p1');
        expect(windowStart).toBeNull();
        expect(windowEnd).toBeNull();
    });

    it('returns all charts', () => {
        expect(resolveFeaturedCharts(baseExample)).toHaveLength(2);
    });
});

describe('landingFeatureModel v5 showcase resolution', () => {
    const example = {
        ...baseExample,
        showcase: {
            session_id: 's2',
            activity_ids: ['activity-2'],
            program_id: 'p2',
            program_start_date: '2026-01-05',
            program_end_date: '2026-01-20',
            chart_ids: ['c2'],
        },
    };

    it('honors the featured session/activities/program/charts', () => {
        expect(resolveFeaturedSession(example).id).toBe('s2');
        expect(resolveFeaturedActivities(example).map((a) => a.id)).toEqual(['activity-2']);
        const { program, windowStart, windowEnd } = resolveFeaturedProgram(example);
        expect(program.id).toBe('p2');
        expect(windowStart).toBe('2026-01-05');
        expect(windowEnd).toBe('2026-01-20');
        expect(resolveFeaturedCharts(example).map((c) => c.id)).toEqual(['c2']);
    });

    it('ignores stale showcase ids and falls back', () => {
        const stale = {
            ...baseExample,
            showcase: { session_id: 'gone', activity_ids: ['gone'], program_id: 'gone', chart_ids: ['gone'] },
        };
        expect(resolveFeaturedSession(stale).id).toBe('s1');
        expect(resolveFeaturedActivities(stale).map((a) => a.id)).toEqual(['activity-1']);
        expect(resolveFeaturedProgram(stale).program.id).toBe('p1');
        expect(resolveFeaturedCharts(stale)).toHaveLength(2);
    });
});

describe('overlapsDateWindow', () => {
    it('passes everything when no window is set', () => {
        expect(overlapsDateWindow('2026-01-01', null, null, null)).toBe(true);
    });

    it('clips events outside the window and keeps overlapping ones', () => {
        expect(overlapsDateWindow('2026-01-01', '2026-01-04', '2026-01-05', '2026-01-20')).toBe(false);
        expect(overlapsDateWindow('2026-01-21', null, '2026-01-05', '2026-01-20')).toBe(false);
        expect(overlapsDateWindow('2026-01-04', '2026-01-06', '2026-01-05', '2026-01-20')).toBe(true);
        expect(overlapsDateWindow('2026-01-10', null, '2026-01-05', '2026-01-20')).toBe(true);
        expect(overlapsDateWindow('2026-01-10T08:00:00Z', null, '2026-01-05', '2026-01-20')).toBe(true);
    });
});

describe('buildActivityLineage', () => {
    it('collects linked goals as targets and their ancestors, excluding unrelated branches', () => {
        const { nodes, targetIds, ancestorIds } = buildActivityLineage(tree, { id: 'activity-1' });
        expect(targetIds).toEqual(new Set(['short']));
        expect(ancestorIds).toEqual(new Set(['long', 'root']));
        expect(nodes.map((node) => node.id).sort()).toEqual(['long', 'root', 'short']);
    });

    it('falls back to the definition associated_goal_ids when tree attributes are missing', () => {
        const bareTree = JSON.parse(JSON.stringify(tree));
        delete bareTree.children[0].children[0].attributes.associated_activity_ids;
        const { targetIds } = buildActivityLineage(bareTree, {
            id: 'activity-1',
            associated_goal_ids: ['short'],
        });
        expect(targetIds).toEqual(new Set(['short']));
    });

    it('returns empty results without an activity', () => {
        const { nodes } = buildActivityLineage(tree, null);
        expect(nodes).toEqual([]);
    });
});
