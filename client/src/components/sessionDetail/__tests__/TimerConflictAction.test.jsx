import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TimerConflictAction, { startTimerWithConflict } from '../TimerConflictAction';

describe('TimerConflictAction', () => {
    it('retains active-work details from a timer conflict', async () => {
        const setConflict = vi.fn();
        const activeWork = {
            activity_instance_id: 'instance-1',
            activity_name: 'Scales',
        };

        await startTimerWithConflict(
            { stopPropagation: vi.fn() },
            {
                autoCompletedRef: { current: true },
                hasTargetDurationInput: false,
                parsedTargetDuration: null,
                onUpdate: vi.fn().mockRejectedValue({
                    response: { data: { code: 'active_work_exists', active_work: activeWork } },
                }),
                setError: vi.fn(),
                setConflict,
            },
        );

        expect(setConflict).toHaveBeenCalledWith({ extras: {}, activeWork });
    });

    it('names the active activity and switches atomically', async () => {
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        const onResolved = vi.fn();
        render(
            <TimerConflictAction
                conflict={{
                    extras: { target_duration_seconds: 90 },
                    activeWork: { activity_name: 'Scales' },
                }}
                onUpdate={onUpdate}
                onResolved={onResolved}
            />,
        );

        expect(screen.getByRole('alert')).toHaveTextContent('Scales is active.');
        fireEvent.click(screen.getByRole('button', { name: 'Stop it and switch' }));

        expect(onUpdate).toHaveBeenCalledWith('timer_action', 'start', {
            target_duration_seconds: 90,
            switch: true,
        });
        await vi.waitFor(() => expect(onResolved).toHaveBeenCalled());
    });
});
