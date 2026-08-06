import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import SessionGoalScopePanel from '../SessionGoalScopePanel';

const selectorProps = vi.fn();

vi.mock('../../goals/GoalHierarchySelector', () => ({
    default: (props) => {
        selectorProps(props);
        return <div data-testid="goal-hierarchy-selector" />;
    },
}));

describe('SessionGoalScopePanel', () => {
    beforeEach(() => {
        selectorProps.mockClear();
    });

    it('presents goal scope as optional rather than as a numbered step', () => {
        render(
            <SessionGoalScopePanel
                goals={[{ id: 'goal-1', name: 'Technique' }]}
                manualGoalIds={['goal-1']}
                automaticGoalIds={['goal-2']}
                onChange={vi.fn()}
                isLoading={false}
            />
        );

        expect(screen.getByRole('heading', { name: 'Session Goals' })).toBeInTheDocument();
        expect(screen.getByText('Optional')).toBeInTheDocument();
        expect(screen.getByText(/Included automatically through template activities/i)).toBeInTheDocument();
        expect(screen.getByTestId('goal-hierarchy-selector')).toBeInTheDocument();
        expect(selectorProps).toHaveBeenCalledWith(expect.objectContaining({
            selectedGoalIds: ['goal-1'],
            lockedGoalIds: ['goal-2'],
            lockedGoalMarker: '*',
            compactLayout: true,
            initialHideCompletedGoals: true,
            lockHideCompletedGoals: true,
            showHideCompletedControl: false,
        }));
    });

    it('labels quick-session scope as read-only and disables selection', () => {
        render(
            <SessionGoalScopePanel
                goals={[]}
                manualGoalIds={[]}
                automaticGoalIds={[]}
                onChange={vi.fn()}
                isLoading={false}
                readOnly
                selectionDisabled
            />
        );

        expect(screen.getByText('Read only')).toBeInTheDocument();
        expect(screen.getByText(/cannot be edited/i)).toBeInTheDocument();
        expect(screen.queryByText(/Included automatically through template activities/i)).not.toBeInTheDocument();
        expect(selectorProps).toHaveBeenCalledWith(expect.objectContaining({
            selectionDisabled: true,
        }));
    });

    it('retains the retry action when automatic scope cannot be resolved', () => {
        const onRetry = vi.fn();
        render(
            <SessionGoalScopePanel
                goals={[]}
                manualGoalIds={[]}
                automaticGoalIds={[]}
                onChange={vi.fn()}
                isLoading={false}
                error={new Error('failed')}
                onRetry={onRetry}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('removes the duplicate card heading when embedded in a mobile sheet', () => {
        render(
            <SessionGoalScopePanel
                goals={[]}
                manualGoalIds={[]}
                automaticGoalIds={[]}
                onChange={vi.fn()}
                isLoading={false}
                embedded
                hideHeading
            />
        );

        expect(screen.queryByRole('heading', { name: 'Session Goals' })).not.toBeInTheDocument();
        expect(screen.getByTestId('goal-hierarchy-selector')).toBeInTheDocument();
    });
});
