import React from 'react';
import { render, screen, within } from '@testing-library/react';

import SessionActivityProgressSummary from '../SessionActivityProgressSummary';


it('shows an overridden comparison inside the total-yield summary section', () => {
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
            activeProgress={{ comparison_context: { mode: 'all', tag_ids: [], tags: [] } }}
        />,
    );

    const indicator = screen.getByRole('note');
    expect(indicator).toHaveTextContent('Comparing with all history');
    expect(within(indicator.parentElement).getByText('Total yield:')).toBeInTheDocument();
});

it('names the chosen tags of a specific-tags comparison even without aggregations', () => {
    render(
        <SessionActivityProgressSummary
            sets={[]}
            metricDefs={[]}
            activeProgress={{ comparison_context: {
                mode: 'tags',
                tag_ids: ['a', 'b'],
                tags: [{ id: 'a', name: 'Heavy' }, { id: 'b', name: 'Paused' }],
            } }}
        />,
    );

    expect(screen.getByRole('note')).toHaveTextContent('Comparing with Heavy + Paused sessions');
    expect(screen.queryByText('Total yield:')).not.toBeInTheDocument();
});

it('shows no indicator for the default same-tags comparison', () => {
    const { container } = render(
        <SessionActivityProgressSummary
            sets={[]}
            metricDefs={[]}
            activeProgress={{ comparison_context: { mode: 'same_tags', tag_ids: [], tags: [] } }}
        />,
    );

    expect(container).toBeEmptyDOMElement();
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
    const summary = screen.getByLabelText('Activity summary metrics');
    expect(within(summary).getByText('Best:')).toBeInTheDocument();
    expect(within(summary).getByText('Set 2 8.9 Seconds')).toBeInTheDocument();
    expect(summary).toHaveTextContent('Total Hold Time:22 SecondsBest:Set 2 8.9 Seconds');
});
