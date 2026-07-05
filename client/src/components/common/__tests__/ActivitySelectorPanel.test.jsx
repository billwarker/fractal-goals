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

    it('searches by activity group name and returns activities inside that group', () => {
        render(
            <ActivitySelectorPanel
                activities={[
                    { id: 'activity-1', name: 'Rows', group_id: 'group-pull' },
                    { id: 'activity-2', name: 'Push Ups', group_id: 'group-push' },
                ]}
                activityGroups={[
                    { id: 'group-pull', name: 'Pull', parent_id: null },
                    { id: 'group-push', name: 'Push', parent_id: null },
                ]}
                onClose={vi.fn()}
                onSelectActivity={vi.fn()}
            />
        );

        fireEvent.change(screen.getByPlaceholderText('Search activities...'), { target: { value: 'Pull' } });

        expect(screen.getByText('Rows')).toBeInTheDocument();
        expect(screen.queryByText('Push Ups')).not.toBeInTheDocument();
    });

    it('searches parent activity groups and deduplicates descendant results', () => {
        render(
            <ActivitySelectorPanel
                activities={[
                    { id: 'activity-1', name: 'Pull Basics', group_id: 'group-vertical' },
                    { id: 'activity-2', name: 'Adv. Tuck FL Holds', group_id: 'group-horizontal' },
                    { id: 'activity-3', name: 'Handstand Hold', group_id: 'group-handstand' },
                ]}
                activityGroups={[
                    { id: 'group-pull', name: 'Pull', parent_id: null },
                    { id: 'group-vertical', name: 'Vertical', parent_id: 'group-pull' },
                    { id: 'group-horizontal', name: 'Horizontal', parent_id: 'group-pull' },
                    { id: 'group-handstand', name: 'Handstand', parent_id: null },
                ]}
                onClose={vi.fn()}
                onSelectActivity={vi.fn()}
            />
        );

        fireEvent.change(screen.getByPlaceholderText('Search activities...'), { target: { value: 'Pull' } });

        expect(screen.getByRole('button', { name: /Select Pull Basics/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Select Adv. Tuck FL Holds/ })).toBeInTheDocument();
        expect(screen.queryByText('Handstand Hold')).not.toBeInTheDocument();
        expect(screen.getAllByText('Pull Basics')).toHaveLength(1);
    });
});
