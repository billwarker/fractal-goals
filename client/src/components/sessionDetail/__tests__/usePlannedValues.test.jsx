import React from 'react';
import { render, renderHook, screen } from '@testing-library/react';

import usePlannedValues from '../usePlannedValues';

const metricDefinitions = [
    { id: 'weight', name: 'Weight', unit: 'kg', higher_is_better: true },
    { id: 'reps', name: 'Reps', unit: 'reps', higher_is_better: true },
];
const prescription = {
    schema: 1,
    notes: 'Pause at the bottom',
    sets: [
        { metrics: [{ metric_id: 'weight', split_id: null, value: 100 }], notes: 'Top set' },
        { metrics: [{ metric_id: 'weight', split_id: null, value: 90 }, { metric_id: 'reps', split_id: null, value: 8 }] },
    ],
};
const getMetricValue = (entries, metricId) => (entries || []).find((entry) => entry.metric_id === metricId)?.value ?? null;

function hintsFor(exercise) {
    return renderHook(() => usePlannedValues({ exercise, metricDefinitions, getMetricValue })).result.current;
}

describe('usePlannedValues', () => {
    it('shows each set\'s planned value as a "(plan …)" hint, like the last-session hint', () => {
        const hints = hintsFor({ prescription, sets: [{ metrics: [] }, { metrics: [] }] });

        render(<>{hints.renderPlannedValue('weight', { setIndex: 1 })}</>);

        const hint = screen.getByTitle('Planned 90');
        expect(hint).toHaveTextContent('(plan 90)');
        expect(hint.className).not.toMatch(/plannedValueMet|plannedValueUnder/);
        expect(hints.activityPlanNote).toBe('Pause at the bottom');
        expect(hints.getSetPlanNote(0)).toBe('Top set');
    });

    it('marks the hint met or under once a value is logged', () => {
        const hints = hintsFor({
            prescription,
            sets: [
                { metrics: [{ metric_id: 'weight', value: 100 }] },
                { metrics: [{ metric_id: 'weight', value: 85 }] },
            ],
        });

        render(<>{hints.renderPlannedValue('weight', { setIndex: 0 })}{hints.renderPlannedValue('weight', { setIndex: 1 })}</>);

        expect(screen.getByTitle('Planned 100 · met').className).toMatch(/plannedValueMet/);
        expect(screen.getByTitle('Planned 90 · under plan').className).toMatch(/plannedValueUnder/);
    });

    it('shows nothing where the plan has no value', () => {
        const hints = hintsFor({ prescription, sets: [{ metrics: [] }] });

        expect(hints.renderPlannedValue('reps', { setIndex: 0 })).toBeNull();
        expect(hints.renderPlannedValue('weight', { setIndex: 5 })).toBeNull();
        expect(hintsFor({ prescription: null }).renderPlannedValue('weight', { setIndex: 0 })).toBeNull();
    });
});
