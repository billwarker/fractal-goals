import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActivityFilterPicker, GoalFilterModal, fullySelectedGroupIds, goalFilterOptions } from '../FilterPickerModals';

const seen = vi.hoisted(() => ({ goal: null, activity: null }));
vi.mock('../../goals/GoalHierarchySelectionModal', () => ({ default: (props) => { seen.goal = props; return null; } }));
vi.mock('../ActivityFilterModal', () => ({ default: (props) => { seen.activity = props; return null; } }));

describe('FilterPickerModals', () => {
    it('configures the goal picker the same way for every page', () => {
        render(<GoalFilterModal isOpen goals={[]} selectedGoalIds={['g1']} onConfirm={vi.fn()} onClose={vi.fn()} />);
        expect(seen.goal).toMatchObject({
            title: 'Filter By Goal', selectionMode: 'multiple', searchPlaceholder: 'Search goals',
            connectorHighlightMode: 'bulk', showGoalHighlightHalo: true, selectedGoalIds: ['g1'],
        });
    });

    it('lets whole groups be selected and keeps the activities they stand for', () => {
        const onConfirm = vi.fn();
        render(<ActivityFilterPicker activities={[]} activityGroups={[]} selectedActivityIds={['a1']} onConfirm={onConfirm} onClose={vi.fn()} />);
        expect(seen.activity).toMatchObject({
            title: 'Filter By Activity', selectionMode: 'multiple', allowGroupSelection: true, confirmLabel: 'Apply',
            groupSelectionLabel: 'Select all', groupSelectedLabel: 'All selected',
        });
        // A selected group arrives as its activities; the filter stores activities only.
        seen.activity.onConfirm(['a2'], ['group-1']);
        expect(onConfirm).toHaveBeenCalledWith(['a2']);
    });

    it('shows a group as selected when all its activities, subgroups included, are', () => {
        const groups = [
            { id: 'songs', name: 'Songs' },
            { id: 'heaven', name: 'Heaven', parent_id: 'songs' },
            { id: 'warmups', name: 'Warm Ups' },
        ];
        const activities = [
            { id: 'a1', group_id: 'songs' }, { id: 'a2', group_id: 'heaven' }, { id: 'a3', group_id: 'heaven' },
            { id: 'w1', group_id: 'warmups' }, { id: 'w2', group_id: 'warmups' },
        ];
        // Songs is complete, so its subgroup Heaven is not listed separately; Warm Ups is partial.
        expect(fullySelectedGroupIds(activities, groups, ['a1', 'a2', 'a3', 'w1'])).toEqual(['songs']);
        expect(fullySelectedGroupIds(activities, groups, ['a2', 'a3'])).toEqual(['heaven']);
        expect(fullySelectedGroupIds(activities, groups, [])).toEqual([]);

        render(<ActivityFilterPicker activities={activities} activityGroups={groups} selectedActivityIds={['w1', 'w2']} onConfirm={vi.fn()} onClose={vi.fn()} />);
        expect(seen.activity.initialGroupIds).toEqual(['warmups']);
    });

    it('flattens a fractal tree in order', () => {
        const tree = { id: 'root', children: [{ id: 'a', children: [{ id: 'a1' }] }, { id: 'b' }] };
        expect(goalFilterOptions(tree).map((goal) => goal.id)).toEqual(['root', 'a', 'a1', 'b']);
        expect(goalFilterOptions(null)).toEqual([]);
    });
});
