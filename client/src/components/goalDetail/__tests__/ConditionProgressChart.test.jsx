import React from 'react';
import { render, screen } from '@testing-library/react';

const lineChart = vi.fn(() => <div data-testid="line" />);
vi.mock('react-chartjs-2', () => ({ Line: (props) => lineChart(props) }));
vi.mock('../../analytics/GoalMarkerLayer', () => ({ GoalMarkerHost: ({ children }) => children }));

import ConditionProgressChart from '../ConditionProgressChart';

const set = (weight, reps) => ({ metrics: [{ metric_id: 'weight', value: weight }, { metric_id: 'reps', value: reps }] });
const activity = {
    id: 'bench',
    metric_definitions: [{ id: 'weight', name: 'Weight', unit: 'lbs' }, { id: 'reps', name: 'Reps', unit: 'reps' }],
};
const condition = {
    kind: 'single_session',
    measure: 'sets',
    rules: [
        { metric_definition_id: 'weight', operator: '>=', value: '225' },
        { metric_definition_id: 'reps', operator: '>=', value: 6 },
    ],
};
const instances = [
    { id: 'a', session_date: '2026-03-01T00:00:00Z', sets: [set(205, 8)] },
    { id: 'b', session_date: '2026-03-05T00:00:00Z', sets: [set(225, 4)] },
];

describe('ConditionProgressChart compact', () => {
    it('keys both rules in the caption, each with its goal, and tints each axis to match its line', () => {
        render(<ConditionProgressChart condition={condition} instances={instances} activity={activity} density="compact" />);
        expect(screen.getByText('Weight · goal ≥ 225 lbs')).toBeInTheDocument();
        expect(screen.getByText('Reps · goal ≥ 6 reps')).toBeInTheDocument();
        expect(screen.getByText('2 sessions')).toBeInTheDocument();
        const { data, options } = lineChart.mock.calls.at(-1)[0];
        expect(options.scales.y0.ticks.color).toBe(data.datasets[0].borderColor);
        expect(options.scales.y1.ticks.color).toBe(data.datasets[1].borderColor);
    });
});

describe('ConditionProgressChart goal marker', () => {
    it('keeps the axis reaching a threshold its goal marker stands on, below every value', () => {
        const lowReps = { ...condition, rules: [{ metric_definition_id: 'reps', operator: '>=', value: 2 }, condition.rules[0]] };
        const goalLines = [{ goal_id: 'goal', goal_name: 'Bench', completed: false, condition: lowReps }];
        render(
            <ConditionProgressChart condition={lowReps} instances={instances} activity={activity} density="compact" goalLines={goalLines} goalId="goal" />,
        );
        const { annotations } = lineChart.mock.calls.at(-1)[0].options.plugins.annotation;
        expect(annotations['threshold-reps']).toMatchObject({ yScaleID: 'y0', yMin: 2, yMax: 2, borderColor: 'transparent' });
        expect(annotations['threshold-reps'].label).toBeUndefined();
        expect(annotations['threshold-weight']).toMatchObject({ yScaleID: 'y1', yMin: 225, borderDash: [6, 4] });
    });
});
