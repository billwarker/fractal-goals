import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const progressHintRender = vi.hoisted(() => vi.fn());

vi.mock('../../../hooks/useRootProgressSettings', () => ({
    useRootProgressSettings: () => ({ progressSettings: { delta_display_mode: 'percent' } }),
}));

vi.mock('../../common/ProgressHint', () => ({
    default: () => {
        progressHintRender();
        return null;
    },
}));

import CircuitMemberMetrics from '../CircuitMemberMetrics';


describe('CircuitMemberMetrics draft performance', () => {
    it('keeps keystroke rendering inside the focused metric editor', async () => {
        progressHintRender.mockClear();
        const onSave = vi.fn().mockResolvedValue(true);

        render(
            <CircuitMemberMetrics
                memberId="member-1"
                rootId="root-1"
                definition={{
                    id: 'activity-1',
                    name: 'Squat',
                    has_splits: false,
                    metric_definitions: [{
                        id: 'metric-1',
                        name: 'Weight',
                        unit: 'kg',
                        input_type: 'number',
                        precision: 2,
                    }],
                }}
                metrics={[{ metric_id: 'metric-1', value: 100 }]}
                onSave={onSave}
            />,
        );

        const input = screen.getByRole('textbox', { name: 'Weight' });
        expect(input).toHaveValue('100.00');
        expect(progressHintRender).toHaveBeenCalledTimes(1);

        fireEvent.change(input, { target: { value: '102.50' } });

        expect(input).toHaveValue('102.50');
        expect(progressHintRender).toHaveBeenCalledTimes(1);
        expect(onSave).not.toHaveBeenCalled();

        fireEvent.blur(input);
        await waitFor(() => expect(onSave).toHaveBeenCalledWith([
            { metric_id: 'metric-1', value: 102.5 },
        ]));
    });
});

describe('CircuitMemberMetrics planned values', () => {
    const definition = {
        id: 'activity-1',
        name: 'Row',
        has_splits: false,
        metric_definitions: [{ id: 'reps', name: 'Reps', unit: 'reps', input_type: 'integer', precision: 0 }],
    };

    it('shows the round\'s planned value beside the input, coloured once a value is logged', () => {
        const { rerender } = render(
            <CircuitMemberMetrics
                memberId="m"
                rootId="root"
                definition={definition}
                metrics={[]}
                progress={{ planned: [{ metric_id: 'reps', split_id: null, value: 12 }] }}
                onSave={vi.fn()}
            />,
        );
        expect(screen.getByTitle('Planned 12')).toHaveTextContent('(plan 12)');

        rerender(
            <CircuitMemberMetrics
                memberId="m"
                rootId="root"
                definition={definition}
                metrics={[{ metric_id: 'reps', value: 10 }]}
                progress={{ planned: [{ metric_id: 'reps', split_id: null, value: 12 }] }}
                onSave={vi.fn()}
            />,
        );
        expect(screen.getByTitle('Planned 12 · under plan')).toBeInTheDocument();
    });

    it('shows no plan chip for an unplanned circuit', () => {
        render(<CircuitMemberMetrics memberId="m" rootId="root" definition={definition} metrics={[]} onSave={vi.fn()} />);
        expect(screen.queryByText(/\(plan /)).not.toBeInTheDocument();
    });
});
