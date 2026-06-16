import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ActivitySelectorPanel from '../ActivitySelectorPanel';

describe('ActivitySelectorPanel', () => {
    it('opens directly inside the requested activity group', () => {
        render(
            <ActivitySelectorPanel
                activities={[
                    { id: 'activity-1', name: 'Wrist Circles', group_id: 'group-warmup' },
                    { id: 'activity-2', name: 'Repertoire Run', group_id: 'group-rep' },
                ]}
                activityGroups={[
                    { id: 'group-warmup', name: 'Warm Up', parent_id: null },
                    { id: 'group-rep', name: 'Repertoire', parent_id: null },
                ]}
                initialBrowseGroupId="group-warmup"
                onClose={vi.fn()}
                onSelectActivity={vi.fn()}
            />
        );

        expect(screen.getByRole('heading', { name: 'Warm Up' })).toBeInTheDocument();
        expect(screen.getByText('Wrist Circles')).toBeInTheDocument();
        expect(screen.queryByText('Repertoire Run')).not.toBeInTheDocument();
    });

    it('lets callers select an activity group separately from an activity', () => {
        const onSelectActivity = vi.fn();
        const onSelectGroup = vi.fn();
        const onClose = vi.fn();

        render(
            <ActivitySelectorPanel
                activities={[
                    { id: 'activity-1', name: 'Wrist Circles', group_id: 'group-warmup' },
                ]}
                activityGroups={[
                    { id: 'group-warmup', name: 'Warm Up', parent_id: null },
                ]}
                allowGroupSelection={true}
                groupSelectionLabel="Set as Default"
                onClose={onClose}
                onSelectActivity={onSelectActivity}
                onSelectGroup={onSelectGroup}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Set as Default' }));

        expect(onSelectGroup).toHaveBeenCalledWith(expect.objectContaining({ id: 'group-warmup' }));
        expect(onSelectActivity).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });
});
