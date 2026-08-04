import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import SessionSectionActivitySelector from '../SessionSectionActivitySelector';

const activities = [
    { id: 'activity-1', name: 'Scale Practice', group_id: 'group-1' },
    { id: 'activity-2', name: 'Unrelated Practice', group_id: null },
];
const activityGroups = [{ id: 'group-1', name: 'Technique', parent_id: null }];
const baseScope = {
    goal: { id: 'goal-1', name: 'Technique Goal' },
    activityIds: ['activity-1'],
    isLoading: false,
    isError: false,
    onClear: vi.fn(),
};

function renderSelector(activityGoalScope = baseScope, circuits = []) {
    return render(
        <SessionSectionActivitySelector
            activities={activities}
            circuitDefinitions={circuits}
            activityGroups={activityGroups}
            activityGoalScope={activityGoalScope}
            onClose={vi.fn()}
            onSelectActivity={vi.fn()}
            onSelectCircuit={vi.fn()}
            onCreateActivityDefinition={vi.fn()}
            onCopyActivityDefinition={vi.fn()}
        />
    );
}

describe('SessionSectionActivitySelector goal scope', () => {
    beforeEach(() => vi.clearAllMocks());

    it('flattens scoped activities with group metadata and keeps scope inside the picker header', () => {
        const { container } = renderSelector();

        expect(screen.queryByText('Scoped to goal')).not.toBeInTheDocument();
        expect(screen.getByText('Technique Goal')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Select Unrelated Practice' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Select Scale Practice' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Technique' })).not.toBeInTheDocument();
        expect(screen.getByText('Technique')).toBeInTheDocument();
        expect(container.querySelector('[class*="picker"] [role="status"]')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close activity picker' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Clear scope' }));
        expect(baseScope.onClear).toHaveBeenCalledOnce();
    });

    it('blocks unfiltered results while loading and offers retry after an error', () => {
        const onRetry = vi.fn();
        const loadingScope = { ...baseScope, activityIds: [], isLoading: true, onRetry };
        const { rerender } = renderSelector(loadingScope);

        expect(screen.getByText('Loading activities for Technique Goal…')).toBeInTheDocument();
        expect(screen.queryByText('Scale Practice')).not.toBeInTheDocument();

        const failedScope = { ...loadingScope, isLoading: false, isError: true };
        rerender(
            <SessionSectionActivitySelector
                activities={activities}
                circuitDefinitions={[]}
                activityGroups={activityGroups}
                activityGoalScope={failedScope}
            />
        );
        expect(screen.getByText('Unable to load activities for Technique Goal.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledOnce();
    });

    it('shows an actionable goal-specific empty state', () => {
        renderSelector({ ...baseScope, activityIds: [] });
        expect(screen.getByText('No activities associated with Technique Goal.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Clear scope' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '+ Create New Activity Definition' })).toBeInTheDocument();
    });

    it('shows circuits when any member matches the scoped goal', () => {
        renderSelector(baseScope, [
            {
                id: 'circuit-match',
                name: 'Matching Circuit',
                slots: [
                    { activity_definition_id: 'activity-1', activity: { id: 'activity-1', name: 'Scale Practice' } },
                    { activity_definition_id: 'activity-2', activity: { id: 'activity-2', name: 'Other' } },
                ],
            },
            {
                id: 'circuit-miss',
                name: 'Unrelated Circuit',
                slots: [{ activity_definition_id: 'activity-2', activity: { id: 'activity-2', name: 'Other' } }],
            },
        ]);
        fireEvent.click(screen.getByRole('tab', { name: 'Activity Circuits' }));

        expect(screen.getByRole('button', { name: 'Select Matching Circuit' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Select Unrelated Circuit' })).not.toBeInTheDocument();
    });
});
