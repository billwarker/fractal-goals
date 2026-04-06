import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ActivityFilterModal from '../ActivityFilterModal';

describe('ActivityFilterModal', () => {
    it('treats groups with missing parents as root-level groups', () => {
        render(
            <ActivityFilterModal
                activities={[
                    { id: 'activity-1', name: 'Major Scale', group_id: 'group-1' },
                ]}
                activityGroups={[
                    { id: 'group-1', name: 'Scales', parent_id: 'root-1' },
                ]}
                onConfirm={vi.fn()}
                onClose={vi.fn()}
            />
        );

        expect(screen.getByText('Scales')).toBeInTheDocument();
        expect(screen.queryByText('No activities found.')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Scales' }));

        expect(screen.getByText('Major Scale')).toBeInTheDocument();
    });

    it('falls back to ungrouped when an activity references a missing group', () => {
        render(
            <ActivityFilterModal
                activities={[
                    { id: 'activity-1', name: 'Chord Changes', group_id: 'missing-group' },
                ]}
                activityGroups={[]}
                onConfirm={vi.fn()}
                onClose={vi.fn()}
            />
        );

        expect(screen.getByText('Ungrouped')).toBeInTheDocument();
        expect(screen.getByText('Chord Changes')).toBeInTheDocument();
    });
});
