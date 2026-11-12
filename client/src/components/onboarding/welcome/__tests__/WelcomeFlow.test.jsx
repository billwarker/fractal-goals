import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import WelcomeFlow from '../WelcomeFlow';

vi.mock('../../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#4f9cf9',
        getGoalSecondaryColor: () => '#1a2a3a',
        getGoalIcon: () => 'circle',
    }),
}));

const renderFlow = (props = {}) => {
    const onCreate = vi.fn();
    const onSkip = vi.fn();
    render(<WelcomeFlow onCreate={onCreate} onSkip={onSkip} {...props} />);
    return { onCreate, onSkip };
};

const next = (name) => fireEvent.click(screen.getByRole('button', { name }));

describe('WelcomeFlow', () => {
    it('walks from welcome to big goal to break-down, then creates the tree once', () => {
        const { onCreate } = renderFlow();
        expect(screen.getByRole('heading', { name: 'Turn a big goal into a tree you can work on' })).toHaveFocus();
        next('Get started');

        expect(screen.getByRole('heading', { name: 'What’s the big goal?' })).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Run a marathon' }));
        expect(screen.getByLabelText('Your big goal')).toHaveValue('Run a marathon');
        next('Continue');

        expect(screen.getByRole('heading', { name: 'Break it down' })).toHaveFocus();
        fireEvent.change(screen.getByLabelText('Long-term goal 1'), { target: { value: 'Run a half marathon' } });
        fireEvent.change(screen.getByLabelText('Long-term goal 3'), { target: { value: '  Run 40 km a week ' } });
        // The preview draws the tree as it's typed.
        expect(screen.getByLabelText('Preview of your tree')).toHaveTextContent('Run a half marathon');
        next('Create my tree');

        expect(onCreate).toHaveBeenCalledWith(
            { name: 'Run a marathon', long_term_goals: ['Run a half marathon', 'Run 40 km a week'] },
            expect.any(String),
        );
    });

    it('can create just the big goal, and reuses one key for a retry', () => {
        const { onCreate } = renderFlow();
        next('Get started');
        fireEvent.change(screen.getByLabelText('Your big goal'), { target: { value: 'Launch my first app' } });
        next('Continue');
        next('Create my goal');
        next('Create my goal');

        expect(onCreate).toHaveBeenCalledTimes(2);
        const [[firstData, firstKey], [, secondKey]] = onCreate.mock.calls;
        expect(firstData).toEqual({ name: 'Launch my first app', long_term_goals: [] });
        expect(secondKey).toBe(firstKey);
    });

    it('goes back without losing what was typed, and can be skipped at any step', () => {
        const { onSkip } = renderFlow();
        next('Get started');
        fireEvent.change(screen.getByLabelText('Your big goal'), { target: { value: 'Speak Spanish' } });
        next('Continue');
        next('Back');
        expect(screen.getByLabelText('Your big goal')).toHaveValue('Speak Spanish');
        next('I’ll set it up myself');
        expect(onSkip).toHaveBeenCalled();
    });
});
