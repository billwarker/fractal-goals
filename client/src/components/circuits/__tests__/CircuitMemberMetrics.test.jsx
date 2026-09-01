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
