import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import GoalCompletionModal from '../GoalCompletionModal';
import GoalUncompletionModal from '../GoalUncompletionModal';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getLevelByName: () => ({ icon: 'circle' }),
        getGoalColor: (type) => (type === 'Completed' ? '#2ecc71' : '#b5179e'),
        getGoalSecondaryColor: (type) => (type === 'Completed' ? '#148f4d' : '#7209b7'),
        getGoalIcon: () => 'circle',
    }),
}));

vi.mock('../../../contexts/TimezoneContext', () => ({
    useTimezone: () => ({ timezone: 'UTC' }),
}));

const activityDefinitions = [{
    id: 'activity-1',
    name: 'Performance and Submission',
    metric_definitions: [
        { id: 'speed', name: 'Playback Speed', unit: '%' },
        { id: 'quality', name: 'Quality', unit: 'Rating' },
    ],
}];

const goal = {
    id: 'goal-1',
    completion_condition: 'activity_threshold',
    condition: {
        activity_definition_id: 'activity-1',
        kind: 'single_session',
        measure: 'sets',
        min_sets: 1,
        rules: [
            { metric_definition_id: 'speed', operator: '>=', value: 100 },
            { metric_definition_id: 'quality', operator: '>=', value: 8 },
        ],
    },
};

const conditionText = 'Performance and Submission: 1 set of Playback Speed ≥ 100 % and Quality ≥ 8 Rating in one session';

const programs = [{
    id: 'program-1',
    name: 'Enlightened and Healthy Guitar',
    color: '#d000a9',
}];

describe('Goal completion confirmation views', () => {
    it('describes the condition and highlights complete-view programs with the program color', () => {
        const onCompletionNoteChange = vi.fn();
        render(
            <GoalCompletionModal
                programs={programs}
                goal={goal}
                activityDefinitions={activityDefinitions}
                completionDate={new Date('2026-07-06T16:20:21')}
                accentColor="#b5179e"
                goalType="ImmediateGoal"
                completionNote=""
                onCompletionNoteChange={onCompletionNoteChange}
            />
        );

        expect(screen.getByText(conditionText)).toBeInTheDocument();
        expect(screen.getByText(/recorded as a manual override/)).toBeInTheDocument();

        const programRow = screen.getByText('Enlightened and Healthy Guitar').closest('div');
        expect(programRow).toHaveStyle({ '--program-accent': '#d000a9' });

        fireEvent.change(screen.getByLabelText('Goal Completion Note (optional):'), {
            target: { value: 'This milestone finally clicked.' },
        });
        expect(onCompletionNoteChange).toHaveBeenCalledWith('This milestone finally clicked.');
    });

    it('describes the condition and highlights incomplete-view programs with the program color', () => {
        const { container } = render(
            <GoalUncompletionModal
                programs={programs}
                goal={goal}
                activityDefinitions={activityDefinitions}
                completedAt="2026-07-06T16:20:21"
                accentColor="#2ecc71"
                goalType="ImmediateGoal"
                goalCompletionNote={{
                    id: 'note-1',
                    content: 'This performance finally felt stable.',
                    context_type: 'goal',
                    context_id: 'goal-1',
                    goal_id: 'goal-1',
                    note_kind: 'goal_completion',
                    note_type: 'goal_completion_note',
                    note_type_label: 'Goal Completion Note',
                    created_at: '2026-07-06T16:22:00Z',
                    goal_name: "She's Got It",
                    goal_type: 'ImmediateGoal',
                }}
            />
        );

        expect(screen.getByText(conditionText)).toBeInTheDocument();
        expect(screen.getByText('This performance finally felt stable.')).toBeInTheDocument();
        expect(screen.queryByText(/This will remove the completion status/)).not.toBeInTheDocument();

        const programRow = screen.getByText('Enlightened and Healthy Guitar').closest('div');
        expect(programRow).toHaveStyle({ '--program-accent': '#d000a9' });
        expect(container.firstElementChild).toHaveStyle({ '--completion-confirm-accent': '#2ecc71' });

        const sectionLabels = screen.getAllByText(/Was completed on:|Programs that will remove this completion:|How this goal completes:|Goal Completion Note:/)
            .map((node) => node.textContent);
        expect(sectionLabels).toEqual([
            'Was completed on:',
            'Programs that will remove this completion:',
            'How this goal completes:',
            'Goal Completion Note:',
        ]);
    });

    it('omits the override hint for manual goals', () => {
        render(
            <GoalCompletionModal
                goal={{ id: 'goal-2', completion_condition: 'manual' }}
                completionDate={new Date('2026-07-06T16:20:21')}
            />
        );

        expect(screen.getByText('Manually')).toBeInTheDocument();
        expect(screen.queryByText(/manual override/)).not.toBeInTheDocument();
    });

    it('offers to begin the next goal in a sequence, checked by default', () => {
        const onBeginNextChange = vi.fn();
        render(
            <GoalCompletionModal
                goal={{ id: 'goal-1', completion_condition: 'manual' }}
                completionDate={new Date('2026-07-06T16:20:21')}
                sequenceNextStep={{ id: 'goal-2', name: 'Step 2' }}
                beginNext
                onBeginNextChange={onBeginNextChange}
            />
        );
        const checkbox = screen.getByRole('checkbox', { name: /Begin next goal in sequence: Step 2/ });
        expect(checkbox).toBeChecked();
        fireEvent.click(checkbox);
        expect(onBeginNextChange).toHaveBeenCalledWith(false);
    });

    it('offers to pause again the goal this completion began', () => {
        const onPauseNextChange = vi.fn();
        render(
            <GoalUncompletionModal
                goal={{ id: 'goal-1', completion_condition: 'manual' }}
                completedAt="2026-07-06T16:20:21"
                sequenceResumedStep={{ id: 'goal-2', name: 'Step 2' }}
                pauseNext
                onPauseNextChange={onPauseNextChange}
            />
        );
        fireEvent.click(screen.getByRole('checkbox', { name: /Pause next goal in sequence: Step 2 again/ }));
        expect(onPauseNextChange).toHaveBeenCalledWith(false);
    });

    it('shows no sequence choice for unsequenced goals', () => {
        render(<GoalCompletionModal goal={{ id: 'goal-1', completion_condition: 'manual' }} completionDate={new Date()} />);
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
});

