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

vi.mock('../../atoms/GoalIcon', () => ({
    default: () => <span data-testid="target-card-icon" />,
}));

const activityDefinitions = [{
    id: 'activity-1',
    name: 'Performance and Submission',
    metric_definitions: [
        { id: 'speed', name: 'Playback Speed', unit: '%' },
        { id: 'quality', name: 'Quality', unit: 'Rating' },
    ],
}];

const targets = [{
    id: 'target-1',
    activity_id: 'activity-1',
    type: 'threshold',
    metrics: [
        { metric_id: 'speed', value: 100 },
        { metric_id: 'quality', value: 8 },
    ],
}];

const programs = [{
    id: 'program-1',
    name: 'Enlightened and Healthy Guitar',
    color: '#d000a9',
}];

describe('Goal completion confirmation views', () => {
    it('renders target cards and highlights complete-view programs with the program color', () => {
        const onCompletionNoteChange = vi.fn();
        const { container } = render(
            <GoalCompletionModal
                programs={programs}
                targets={targets}
                activityDefinitions={activityDefinitions}
                completionDate={new Date('2026-07-06T16:20:21')}
                accentColor="#b5179e"
                goalType="ImmediateGoal"
                completionNote=""
                onCompletionNoteChange={onCompletionNoteChange}
            />
        );

        expect(screen.getByText('Performance and Submission')).toBeInTheDocument();
        expect(screen.getByText('Playback Speed')).toBeInTheDocument();
        expect(screen.getByText('100 %')).toBeInTheDocument();

        const programRow = screen.getByText('Enlightened and Healthy Guitar').closest('div');
        expect(programRow).toHaveStyle({ '--program-accent': '#d000a9' });
        expect(container.querySelector('[data-testid="target-card-icon"]')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Goal Completion Note (optional):'), {
            target: { value: 'This milestone finally clicked.' },
        });
        expect(onCompletionNoteChange).toHaveBeenCalledWith('This milestone finally clicked.');
    });

    it('renders target cards and highlights incomplete-view programs with the program color', () => {
        render(
            <GoalUncompletionModal
                programs={programs}
                targets={targets}
                activityDefinitions={activityDefinitions}
                completedAt="2026-07-06T16:20:21"
                accentColor="#b5179e"
                goalType="ImmediateGoal"
            />
        );

        expect(screen.getByText('Performance and Submission')).toBeInTheDocument();
        expect(screen.getByText('Quality')).toBeInTheDocument();
        expect(screen.getByText('8 Rating')).toBeInTheDocument();

        const programRow = screen.getByText('Enlightened and Healthy Guitar').closest('div');
        expect(programRow).toHaveStyle({ '--program-accent': '#d000a9' });
    });
});
