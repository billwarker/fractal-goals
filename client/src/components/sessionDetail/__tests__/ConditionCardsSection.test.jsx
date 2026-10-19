import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ConditionCardsSection from '../ConditionCardsSection';

const activityDefinitions = [{ id: 'run', name: 'Run', metric_definitions: [{ id: 'km', name: 'Distance', unit: 'km' }] }];
const card = (overrides = {}) => ({
    goalId: 'goal-1',
    goalName: 'Run 50 km',
    goalType: 'ShortTermGoal',
    goalDepth: 2,
    condition: {
        activity_definition_id: 'run',
        kind: 'cumulative',
        measure: 'metric',
        metric_definition_id: 'km',
        operator: '>=',
        target_value: 50,
    },
    completed: false,
    progress: { met: false, current: 20, required: 50, progress: 0.4 },
    ...overrides,
});

describe('ConditionCardsSection', () => {
    it('renders nothing without cards', () => {
        const { container } = render(<ConditionCardsSection cards={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows each goal with its condition and progress, scoped to the selected activity', () => {
        render(<ConditionCardsSection cards={[card()]} activityDefinitions={activityDefinitions} scopedActivityName="Run" />);

        expect(screen.getByText('Goal thresholds: Run')).toBeInTheDocument();
        expect(screen.getByText('Run 50 km')).toBeInTheDocument();
        expect(screen.getByText('Run: Distance ≥ 50 km in total')).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Progress: 20 / 50' })).toHaveAttribute('aria-valuenow', '40');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('fills completed cards and uses the completed colour', () => {
        const getGoalColor = vi.fn((type) => (type === 'Completed' ? '#2ecc71' : '#3b82f6'));
        render(
            <ConditionCardsSection
                cards={[card({ completed: true, progress: null })]}
                activityDefinitions={activityDefinitions}
                getGoalColor={getGoalColor}
            />
        );

        expect(screen.getByText('Goal thresholds')).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Progress: Complete' })).toHaveAttribute('aria-valuenow', '100');
        expect(getGoalColor).toHaveBeenCalledWith('Completed');
    });

    it('opens a card when clickable', () => {
        const onCardClick = vi.fn();
        render(<ConditionCardsSection cards={[card()]} activityDefinitions={activityDefinitions} onCardClick={onCardClick} />);

        fireEvent.click(screen.getByRole('button', { name: /Run 50 km/ }));
        expect(onCardClick).toHaveBeenCalledWith(expect.objectContaining({ goalId: 'goal-1' }));
    });
});
