import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ActivitySelectorPanel from '../ActivitySelectorPanel';

describe('ActivitySelectorPanel', () => {
    it('separates all circuits behind the definition-type toggle', () => {
        const onSelectActivity = vi.fn();
        const onSelectCircuit = vi.fn();
        render(
            <ActivitySelectorPanel
                activities={[{ id: 'activity-1', name: 'Scale Practice', group_id: null }]}
                circuits={[
                    {
                        id: 'circuit-1',
                        name: 'Technique Circuit',
                        group_id: 'group-technique',
                        slots: [{ id: 'slot-technique', activity: { name: 'Scales' } }],
                    },
                    {
                        id: 'circuit-2',
                        name: 'Ungrouped Circuit',
                        group_id: null,
                        slots: [
                            {
                                id: 'slot-2',
                                sort_order: 2,
                                activity: { name: 'Rows', description: 'Pull with a controlled tempo.' },
                            },
                            {
                                id: 'slot-1',
                                sort_order: 1,
                                activity: { name: 'Scapular Pulls', description: 'Keep the elbows straight.' },
                            },
                        ],
                    },
                ]}
                activityGroups={[{ id: 'group-technique', name: 'Technique', parent_id: null }]}
                onClose={vi.fn()}
                onSelectActivity={onSelectActivity}
                onSelectCircuit={onSelectCircuit}
                allowCreate
                allowCopy
                showTypeToggle
            />,
        );

        expect(screen.getByRole('tablist', { name: 'Definition type' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Select Activity Group' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Select Scale Practice' })).toBeInTheDocument();
        expect(screen.queryByText('Ungrouped Circuit')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: 'Activity Circuits' }));

        expect(screen.queryByText('Scale Practice')).not.toBeInTheDocument();
        expect(screen.getByPlaceholderText('Search activity circuits...')).toBeInTheDocument();
        expect(screen.getByText('Ungrouped Activity Circuits')).toBeInTheDocument();
        expect(screen.getByText('Circuit • 2 activities')).toBeInTheDocument();
        const circuitActivities = screen.getByRole('list', { name: 'Ungrouped Circuit activities' });
        expect(circuitActivities).toHaveTextContent('Scapular Pulls');
        expect(circuitActivities).toHaveTextContent('Keep the elbows straight.');
        expect(circuitActivities).toHaveTextContent('Rows');
        expect(circuitActivities).toHaveTextContent('Pull with a controlled tempo.');
        expect(
            screen.getByText('Scapular Pulls').compareDocumentPosition(screen.getByText('Rows'))
            & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        expect(screen.queryByRole('button', { name: '+ Create New Activity Definition' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '+ Copy Existing Activity Definition' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Select Ungrouped Circuit' }));
        expect(onSelectCircuit).toHaveBeenCalledWith(expect.objectContaining({ id: 'circuit-2' }));
        expect(onSelectActivity).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Technique' }));
        expect(screen.getByRole('button', { name: /Back/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Select Technique Circuit' })).toBeInTheDocument();
        expect(screen.getByText('Circuit • 1 activity')).toBeInTheDocument();
    });

    it('uses circuit-specific create and copy actions when circuit callbacks are provided', () => {
        const onCreateCircuitDefinition = vi.fn();
        const onCopyCircuitDefinition = vi.fn();
        render(
            <ActivitySelectorPanel
                activities={[]}
                circuits={[{ id: 'circuit-1', name: 'Technique Circuit', slots: [] }]}
                activityGroups={[]}
                onClose={vi.fn()}
                onSelectActivity={vi.fn()}
                onSelectCircuit={vi.fn()}
                onCreateCircuitDefinition={onCreateCircuitDefinition}
                onCopyCircuitDefinition={onCopyCircuitDefinition}
                showTypeToggle
            />,
        );

        fireEvent.click(screen.getByRole('tab', { name: 'Activity Circuits' }));
        fireEvent.click(screen.getByRole('button', { name: '+ Create New Activity Circuit' }));
        expect(onCreateCircuitDefinition).toHaveBeenCalledOnce();

        fireEvent.click(screen.getByRole('button', { name: '+ Copy Existing Activity Circuit' }));
        expect(screen.getByText(
            'Copy mode: select an existing activity circuit to duplicate into a new one.'
        )).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Copy Technique Circuit' }));
        expect(onCopyCircuitDefinition).toHaveBeenCalledWith(expect.objectContaining({ id: 'circuit-1' }));
    });

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
                showTypeToggle
            />
        );

        const typeToggle = screen.getByRole('tablist', { name: 'Definition type' });
        const groupHeading = screen.getByRole('heading', { name: 'Warm Up' });
        expect(typeToggle.compareDocumentPosition(groupHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getAllByText('Warm Up')).toHaveLength(1);
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
