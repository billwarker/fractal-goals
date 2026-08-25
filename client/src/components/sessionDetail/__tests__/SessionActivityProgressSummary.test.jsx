import React from 'react';
import { render, screen, within } from '@testing-library/react';

import SessionActivityProgressSummary from '../SessionActivityProgressSummary';


const excludedMessage = 'Excluded from the active progress view. Metrics remain available as raw session data.';

it('places the excluded indicator inside the total-yield summary section', () => {
    render(
        <SessionActivityProgressSummary
            sets={[{
                metrics: [
                    { metric_id: 'weight', value: '10' },
                    { metric_id: 'reps', value: '2' },
                ],
            }]}
            metricDefs={[
                { id: 'weight', name: 'Weight', unit: 'lbs', is_multiplicative: true },
                { id: 'reps', name: 'Reps', unit: 'count', is_multiplicative: true },
            ]}
            activeProgress={{ included: false }}
        />,
    );

    const indicator = screen.getByText(excludedMessage);
    expect(within(indicator.parentElement).getByText('Total yield:')).toBeInTheDocument();
});

it('retains the excluded indicator when no aggregation can be calculated', () => {
    render(
        <SessionActivityProgressSummary
            sets={[]}
            metricDefs={[]}
            activeProgress={{ included: false }}
        />,
    );

    expect(screen.getByText(excludedMessage)).toBeInTheDocument();
    expect(screen.queryByText('Total yield:')).not.toBeInTheDocument();
});

it('derives additive totals for a dual-mode metric from rendered sets when the stored summary is stale', () => {
    render(
        <SessionActivityProgressSummary
            sets={[
                { metrics: [{ metric_id: 'hold-time', value: '8.1' }] },
                { metrics: [{ metric_id: 'hold-time', value: '8.9' }] },
                { metrics: [{ metric_id: 'hold-time', value: '5' }] },
            ]}
            metricDefs={[
                {
                    id: 'hold-time',
                    name: 'Hold Time',
                    unit: 'Seconds',
                    is_additive: true,
                    is_multiplicative: true,
                    is_best_set_metric: true,
                },
            ]}
            activeProgress={{
                derived_summary: {
                    auto_aggregations: {
                        additive_totals: {},
                        best_set_index: 1,
                        best_set_values: { 'hold-time': 8.9 },
                    },
                },
            }}
        />,
    );

    expect(screen.getByText('Total Hold Time:')).toBeInTheDocument();
    expect(screen.getByText(/22 Seconds/)).toBeInTheDocument();
    const bestSet = screen.getByText(/Best: Set 2 8.9 Seconds/);
    expect(bestSet).toBeInTheDocument();
    expect(bestSet.closest('[class*="progressSummaryRow"]')).toHaveTextContent(
        'Total Hold Time:22 Seconds·Best: Set 2 8.9 Seconds',
    );
});
