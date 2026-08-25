import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TimerConflictAction, { startTimerWithConflict } from '../TimerConflictAction';

describe('TimerConflictAction', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

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

        expect(screen.getByRole('alert')).toHaveTextContent('Scales is active. Complete it and switch');
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Complete it and switch' }));
        });

        expect(onUpdate).toHaveBeenCalledWith('timer_action', 'start', {
            target_duration_seconds: 90,
            switch: true,
        });
        expect(onResolved).toHaveBeenCalled();
    });

    it('can be dismissed without switching timers', () => {
        const onUpdate = vi.fn();
        const onResolved = vi.fn();
        render(
            <TimerConflictAction
                conflict={{ activeWork: { activity_name: 'Scales' } }}
                onUpdate={onUpdate}
                onResolved={onResolved}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Dismiss timer conflict' }));

        expect(onResolved).toHaveBeenCalledOnce();
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('fades after ten seconds before dismissing itself', () => {
        vi.useFakeTimers();
        const onResolved = vi.fn();
        render(
            <TimerConflictAction
                conflict={{ activeWork: { activity_name: 'Scales' } }}
                onUpdate={vi.fn()}
                onResolved={onResolved}
            />,
        );

        const alert = screen.getByRole('alert');
        act(() => {
            vi.advanceTimersByTime(9_999);
        });
        expect(alert.className).not.toContain('timerConflictFading');
        expect(onResolved).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(alert.className).toContain('timerConflictFading');
        expect(onResolved).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(250);
        });
        expect(onResolved).toHaveBeenCalledOnce();
    });
});
