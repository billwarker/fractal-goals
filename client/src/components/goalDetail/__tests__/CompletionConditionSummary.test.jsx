import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import CompletionConditionSummary from '../CompletionConditionSummary';

const { useGoalConditionProgressMock } = vi.hoisted(() => ({
    useGoalConditionProgressMock: vi.fn(() => ({ progressByGoalId: {} })),
}));

vi.mock('../../../hooks/useGoalConditionQueries', () => ({
    useGoalConditionProgress: (...args) => useGoalConditionProgressMock(...args),
}));

vi.mock('../ChildGoalIconRow', () => ({
    default: ({ childGoals }) => <div data-testid="child-icons">{childGoals.length}</div>,
}));

const pullUps = { id: 'pull-up', name: 'Pull Up', metric_definitions: [{ id: 'reps', name: 'Reps', unit: '' }] };
const thresholdGoal = (overrides = {}) => ({
    id: 'goal-1',
    completion_condition: 'activity_threshold',
    condition: {
        activity_definition_id: 'pull-up',
        kind: 'single_session',
        measure: 'sets',
        min_sets: 3,
        rules: [{ metric_definition_id: 'reps', operator: '>=', value: 10 }],
    },
    ...overrides,
});

function renderSummary(props = {}) {
    return render(
        <CompletionConditionSummary
            goal={thresholdGoal()}
            goalId="goal-1"
            goalName="Ten Clean Pull Ups"
            rootId="root-1"
            goalColor="#22d3ee"
            activityDefinitions={[pullUps]}
            {...props}
        />
    );
}

describe('CompletionConditionSummary', () => {
    beforeEach(() => {
        useGoalConditionProgressMock.mockReset();
        useGoalConditionProgressMock.mockReturnValue({ progressByGoalId: {} });
    });

    it('describes the threshold and shows live progress', () => {
        useGoalConditionProgressMock.mockReturnValue({
            progressByGoalId: { 'goal-1': { met: false, current: 2, required: 3, progress: 2 / 3 } },
        });
        renderSummary();

        expect(useGoalConditionProgressMock).toHaveBeenCalledWith('root-1', ['goal-1'], { enabled: true });
        expect(screen.getByText('Pull Up: 3 sets of Reps ≥ 10 in one session')).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Progress: 2 / 3 sets' })).toHaveAttribute('aria-valuenow', '67');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('prompts to complete when the condition is met but the goal is still open', () => {
        const onCompleteNow = vi.fn();
        useGoalConditionProgressMock.mockReturnValue({
            progressByGoalId: { 'goal-1': { met: true, current: 3, required: 3, progress: 1 } },
        });
        renderSummary({ onCompleteNow });

        expect(screen.getByRole('status')).toHaveTextContent('Your logged activity already meets this.');
        fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }));
        expect(onCompleteNow).toHaveBeenCalledTimes(1);
    });

    it('does not prompt for paused or completed goals, and names how a completed goal finished', () => {
        useGoalConditionProgressMock.mockReturnValue({
            progressByGoalId: { 'goal-1': { met: true, current: 3, required: 3, progress: 1 } },
        });
        const { rerender } = renderSummary({ goal: thresholdGoal({ paused: true }), onCompleteNow: vi.fn() });
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        rerender(
            <CompletionConditionSummary
                goal={thresholdGoal({ completed: true, completion_state: { source: 'manual_override' } })}
                goalId="goal-1"
                rootId="root-1"
                activityDefinitions={[pullUps]}
                onCompleteNow={vi.fn()}
            />
        );
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getByText('Completed manually (override)')).toBeInTheDocument();
    });

    it('skips the progress fetch for manual goals', () => {
        renderSummary({ goal: { id: 'goal-1', completion_condition: 'manual' } });

        expect(useGoalConditionProgressMock).toHaveBeenCalledWith('root-1', ['goal-1'], { enabled: false });
        expect(screen.getByText('Completes when you mark it complete.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'See the evidence' })).not.toBeInTheDocument();
    });

    it('shows child progress for goals that complete through their children', () => {
        useGoalConditionProgressMock.mockReturnValue({
            progressByGoalId: {
                'goal-1': { completion_condition: 'children', children: { completed: 1, total: 4 }, progress: 0.25 },
            },
        });
        renderSummary({ goal: { id: 'goal-1', completion_condition: 'children' } });

        expect(screen.getByRole('progressbar', { name: 'Progress: 1 / 4 child goals' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'See the evidence' })).not.toBeInTheDocument();
    });

    it('lines up child goal icons instead of a bar when the children are known', () => {
        useGoalConditionProgressMock.mockReturnValue({
            progressByGoalId: {
                'goal-1': { completion_condition: 'children', children: { completed: 1, total: 2 }, progress: 0.5 },
            },
        });
        renderSummary({
            goal: { id: 'goal-1', completion_condition: 'children' },
            childGoals: [{ id: 'c1', completed: true }, { id: 'c2' }],
        });

        expect(screen.getByTestId('child-icons')).toHaveTextContent('2');
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(screen.queryByText('Completes when every child goal is complete.')).not.toBeInTheDocument();
    });

    it('shows the published snapshot\'s progress when read-only, with no evidence link', () => {
        renderSummary({
            readOnly: true,
            snapshot: { progress: { met: false, current: 1, required: 3, progress: 1 / 3 }, instances: [] },
        });
        expect(useGoalConditionProgressMock).toHaveBeenLastCalledWith('root-1', ['goal-1'], { enabled: false });
        expect(screen.getByRole('progressbar', { name: 'Progress: 1 / 3 sets' })).toBeInTheDocument();
        expect(screen.queryByText('See the evidence')).not.toBeInTheDocument();
    });

    it('leaves an activity threshold\'s progress to the goal chart, keeping only Mark complete', () => {
        useGoalConditionProgressMock.mockReturnValue({ progressByGoalId: { 'goal-1': { met: true, sets: 3, required_sets: 3 } } });
        const onCompleteNow = vi.fn();
        const { container, rerender } = renderSummary({ chartShowsProgress: true, onCompleteNow });
        expect(screen.queryByText('Completion')).not.toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(screen.queryByText('See the evidence')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }));
        expect(onCompleteNow).toHaveBeenCalled();

        useGoalConditionProgressMock.mockReturnValue({ progressByGoalId: {} });
        rerender(<CompletionConditionSummary goal={thresholdGoal()} goalId="goal-1" rootId="root-1" chartShowsProgress />);
        expect(container).toBeEmptyDOMElement();
    });

    it('keeps the section for goals that complete by children', () => {
        renderSummary({ chartShowsProgress: true, goal: thresholdGoal({ completion_condition: 'children' }) });
        expect(screen.getByText('Completion')).toBeInTheDocument();
    });
});
