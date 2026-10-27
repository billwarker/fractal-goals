import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActivityFilterPicker, GoalFilterModal, goalFilterOptions } from '../FilterPickerModals';

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

    it('configures the activity picker for individual activities', () => {
        const onConfirm = vi.fn();
        render(<ActivityFilterPicker activities={[]} activityGroups={[]} selectedActivityIds={['a1']} onConfirm={onConfirm} onClose={vi.fn()} />);
        expect(seen.activity).toMatchObject({ title: 'Filter By Activity', selectionMode: 'multiple', allowGroupSelection: false, confirmLabel: 'Apply' });
        seen.activity.onConfirm(['a2'], ['ignored-group']);
        expect(onConfirm).toHaveBeenCalledWith(['a2']);
    });

    it('flattens a fractal tree in order', () => {
        const tree = { id: 'root', children: [{ id: 'a', children: [{ id: 'a1' }] }, { id: 'b' }] };
        expect(goalFilterOptions(tree).map((goal) => goal.id)).toEqual(['root', 'a', 'a1', 'b']);
        expect(goalFilterOptions(null)).toEqual([]);
    });
});
