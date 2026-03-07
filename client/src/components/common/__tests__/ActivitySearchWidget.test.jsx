import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ActivitySearchWidget from '../ActivitySearchWidget';

const activityGroups = [
    { id: 'group-1', name: 'Strength' },
    { id: 'group-2', name: 'Skill' },
];

const activities = [
    { id: 'activity-1', name: 'Pull Ups', group_id: 'group-1', type: 'reps' },
    { id: 'activity-2', name: 'Rows', group_id: 'group-1', type: 'reps' },
    { id: 'activity-3', name: 'Handstands', group_id: 'group-2', type: 'holds' },
    { id: 'activity-4', name: 'Mobility', group_id: null, type: 'time' },
];

describe('ActivitySearchWidget', () => {
    it('keeps preselected activity counts visible on the group cards', () => {
        render(
            <ActivitySearchWidget
                activities={activities}
                activityGroups={activityGroups}
                preSelectedActivityIds={['activity-1', 'activity-4']}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />
        );

        expect(screen.getByText('Strength')).toBeInTheDocument();
        expect(screen.getAllByText('1 selected')).toHaveLength(2);
        expect(screen.getByText('Ungrouped')).toBeInTheDocument();
    });

    it('selects and unselects an entire group without duplicating activities', () => {
        const onConfirm = vi.fn();

        render(
            <ActivitySearchWidget
                activities={activities}
                activityGroups={activityGroups}
                allowGroupSelection={true}
                onConfirm={onConfirm}
                onCancel={vi.fn()}
            />
        );

        fireEvent.click(screen.getAllByRole('button', { name: 'Link Group' })[0]);
        fireEvent.click(screen.getByRole('button', { name: /Add Selected \(2\)/ }));

        expect(onConfirm).toHaveBeenCalledWith(['activity-1', 'activity-2'], ['group-1']);

        onConfirm.mockClear();

        fireEvent.click(screen.getByRole('button', { name: '✓ Linked' }));
        expect(screen.getByRole('button', { name: /Add Selected \(0\)/ })).toBeDisabled();
    });

    it('lets the user drill into ungrouped activities and confirm a single selection', () => {
        const onConfirm = vi.fn();

        render(
            <ActivitySearchWidget
                activities={activities}
                activityGroups={activityGroups}
                onConfirm={onConfirm}
                onCancel={vi.fn()}
            />
        );

        fireEvent.click(screen.getByText('Ungrouped'));
        fireEvent.click(screen.getByText('Mobility'));
        fireEvent.click(screen.getByRole('button', { name: /Add Selected \(1\)/ }));

        expect(onConfirm).toHaveBeenCalledWith(['activity-4'], []);
    });
});
