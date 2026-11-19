import { describe, expect, it } from 'vitest';

import { getPreviewView } from '../LandingTreePreview';

const TREE = {
    id: 'root',
    children: [
        { id: 'a', children: [{ id: 'a1', children: [] }] },
        { id: 'b', children: [] },
    ],
};
const PROGRAM = {
    id: 'program-1',
    name: 'Winter woodshed',
    start_date: '2026-11-01T00:00:00Z',
    end_date: '2026-12-31T00:00:00Z',
    scope_goal_ids: ['a'],
};

const example = ({ view, preview = {} }) => ({
    id: 'root',
    appearance: view ? { flowtree_views: { root: view } } : {},
    preview: { tree: TREE, ...preview },
});

describe('getPreviewView', () => {
    it('opens on the published filters, scope and active goals, without the metrics overlay', () => {
        const view = getPreviewView(example({
            view: { scopedProgramId: 'program-1', viewSettings: { hideCompletedGoals: true, showMetricsOverlay: true } },
            preview: { evidence_goal_ids: ['a1'], program: PROGRAM },
        }), '2026-11-18');

        expect(view.viewSettings).toEqual({ hideCompletedGoals: true, showMetricsOverlay: false });
        expect([...view.evidenceGoalIds]).toEqual(['a1']);
        expect(view.allowedGoalIds.has('a')).toBe(true);
        expect(view.allowedGoalIds.has('root')).toBe(true);
        expect(view.allowedGoalIds.has('b')).toBe(false);
        expect(view.scopedProgramName).toBe('Winter woodshed');
    });

    it('drops a program scope once the program has ended, as the Goals page does', () => {
        const view = getPreviewView(example({
            view: { scopedProgramId: 'program-1', viewSettings: {} },
            preview: { program: PROGRAM },
        }), '2027-02-01');

        expect(view.allowedGoalIds).toBeNull();
        expect(view.scopedProgramName).toBeNull();
    });

    it('skips the inactive filters for a publish that carried no activity', () => {
        const view = getPreviewView(example({
            view: { viewSettings: { hideInactiveGoals: true, fadeInactiveBranches: true, hideCompletedGoals: true } },
        }));

        expect(view.viewSettings).toMatchObject({ hideInactiveGoals: false, fadeInactiveBranches: false, hideCompletedGoals: true });
        expect(view.evidenceGoalIds).toBeNull();
    });

    it('draws the whole tree when nothing was published', () => {
        expect(getPreviewView(example({}))).toEqual({});
    });
});
