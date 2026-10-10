import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProgramDayScheduleActions from '../ProgramDayScheduleActions';

const program = {
    id: 'program', start_date: '2026-09-01', end_date: '2026-09-30',
    days: [
        { id: 'strength', name: 'Strength', day_of_week: ['Monday'] },
        { id: 'mobility', name: 'Mobility', day_of_week: ['Tuesday'], excluded_dates: ['2026-09-15'] },
    ],
};
function setup(props = {}) {
    const onMoveDay = vi.fn().mockResolvedValue(undefined);
    const onUnscheduleDay = vi.fn().mockResolvedValue(undefined);
    render(<ProgramDayScheduleActions program={program} dayId="strength" date="2026-09-07"
        onMoveDay={onMoveDay} onUnscheduleDay={onUnscheduleDay} {...props} />);
    return { onMoveDay, onUnscheduleDay };
}
function moveTo(value) {
    fireEvent.click(screen.getByRole('button', { name: 'Move day' }));
    fireEvent.change(screen.getByLabelText('Move to date'), { target: { value } });
}

describe('ProgramDayScheduleActions', () => {
    it('bounds dates and prevents empty, same-date and out-of-range submissions', () => {
        setup();
        fireEvent.click(screen.getByRole('button', { name: 'Move day' }));
        const input = screen.getByLabelText('Move to date');
        expect(input).toHaveFocus();
        expect(input).toHaveAttribute('min', '2026-09-01');
        expect(input).toHaveAttribute('max', '2026-09-30');
        for (const value of ['', '2026-09-07', '2026-10-01']) {
            fireEvent.change(input, { target: { value } });
            expect(screen.getByRole('button', { name: /^Move$|Move and replace/ })).toBeDisabled();
        }
    });

    it('explains replacement and submits the source and destination', async () => {
        const { onMoveDay } = setup();
        moveTo('2026-09-08');
        expect(screen.getByText(/Mobility on .* will be removed/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Move and replace' }));
        await waitFor(() => expect(onMoveDay).toHaveBeenCalledWith('strength', '2026-09-07', '2026-09-08'));
    });

    it('treats excluded destination dates as free', () => {
        setup();
        moveTo('2026-09-15');
        expect(screen.getByRole('button', { name: 'Move', exact: true })).toBeEnabled();
        expect(screen.queryByRole('button', { name: 'Move and replace' })).not.toBeInTheDocument();
    });

    it('retains entered date and inline error on failure, then retries', async () => {
        const onMoveDay = vi.fn().mockRejectedValueOnce({ response: { data: { error: 'Schedule changed. Try again.' } } }).mockResolvedValue(undefined);
        setup({ onMoveDay });
        moveTo('2026-09-09');
        fireEvent.click(screen.getByRole('button', { name: 'Move', exact: true }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Schedule changed. Try again.');
        expect(screen.getByLabelText('Move to date')).toHaveValue('2026-09-09');
        fireEvent.click(screen.getByRole('button', { name: 'Move', exact: true }));
        await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
        expect(onMoveDay).toHaveBeenCalledTimes(2);
    });

    it('disables all form actions while a request is pending', async () => {
        let resolve;
        setup({ onMoveDay: () => new Promise((done) => { resolve = done; }) });
        moveTo('2026-09-09');
        fireEvent.click(screen.getByRole('button', { name: 'Move', exact: true }));
        expect(screen.getByLabelText('Move to date')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        await act(async () => resolve());
    });

    it('requires removal confirmation and supports cancellation with Escape', async () => {
        const { onUnscheduleDay } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Remove from this date' }));
        expect(onUnscheduleDay).not.toHaveBeenCalled();
        expect(screen.getByText(/Remove only this occurrence/)).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' });
        expect(screen.queryByRole('form')).not.toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Remove from this date' })).toHaveFocus());
        fireEvent.click(screen.getByRole('button', { name: 'Remove from this date' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove day', exact: true }));
        await waitFor(() => expect(onUnscheduleDay).toHaveBeenCalledWith('strength', '2026-09-07'));
    });
});
