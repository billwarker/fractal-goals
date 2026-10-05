import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ProgramBlockModal from '../ProgramBlockModal';

const programDates = { start: '2026-09-01', end: '2026-10-31' };
const siblingBlocks = [{ id: 'week-1', name: 'Week 1', start_date: '2026-09-01', end_date: '2026-09-07' }];

function renderModal(props = {}) {
    const onSave = props.onSave || vi.fn().mockResolvedValue(undefined);
    render(
        <ProgramBlockModal
            isOpen
            onClose={vi.fn()}
            onSave={onSave}
            programDates={programDates}
            siblingBlocks={siblingBlocks}
            {...props}
        />,
    );
    return onSave;
}

describe('ProgramBlockModal', () => {
    it('explains an overlap with a sibling block and blocks saving', () => {
        const onSave = renderModal({ initialData: { name: 'Week 2', start_date: '2026-09-05', end_date: '2026-09-12' } });

        expect(screen.getByRole('alert')).toHaveTextContent('Overlaps Week 1');
        const save = screen.getByRole('button', { name: 'Save Block' });
        expect(save).toBeDisabled();
        fireEvent.click(save);
        expect(onSave).not.toHaveBeenCalled();
    });

    it('saves a block that starts the day after its sibling ends', async () => {
        const onSave = renderModal({ initialData: { name: 'Week 2', start_date: '2026-09-08', end_date: '2026-09-14' } });

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Save Block' }));

        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            startDate: '2026-09-08', endDate: '2026-09-14',
        })));
        expect(onSave.mock.calls[0][0]).not.toHaveProperty('goal_ids');
    });

    it('does not count the block being edited as its own overlap', () => {
        renderModal({ initialData: { id: 'week-1', name: 'Week 1', start_date: '2026-09-01', end_date: '2026-09-07' } });

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save Block' })).toBeEnabled();
    });

    it('shows a server calendar conflict inline', async () => {
        const onSave = vi.fn().mockRejectedValue({ response: { status: 409, data: {
            code: 'program_block_overlap', error: "Blocks can't overlap. Deload already covers Sep 9 – Sep 10.",
        } } });
        renderModal({ onSave, siblingBlocks: [], initialData: { name: 'Week 2', start_date: '2026-09-08', end_date: '2026-09-14' } });

        fireEvent.click(screen.getByRole('button', { name: 'Save Block' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Deload already covers');
    });

    it('sets the end date from a length in weeks', async () => {
        const onSave = renderModal({ initialData: { name: 'Week 2', start_date: '2026-09-08', end_date: '2026-09-14' } });

        expect(screen.queryByText(/focus goals/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/alignment threshold/i)).not.toBeInTheDocument();
        expect(screen.getByLabelText('Length (weeks)')).toHaveValue(1);
        fireEvent.change(screen.getByLabelText('Length (weeks)'), { target: { value: '3' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save Block' }));

        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ endDate: '2026-09-28' })));
    });

    describe('week tracking', () => {
        // Sep 1, 2026 is a Tuesday.
        const month = { name: 'Month 1', start_date: '2026-09-01', end_date: '2026-09-30' };

        it('reveals a weekday picker that starts on Sunday and previews the weeks', async () => {
            const onSave = renderModal({ siblingBlocks: [], initialData: month });

            expect(screen.queryByRole('group', { name: 'Weeks start on' })).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('checkbox', { name: 'Track weeks' }));

            expect(screen.getByRole('radio', { name: 'Sunday' })).toBeChecked();
            expect(screen.getByText('Week 1: Sep 1 – Sep 5 (partial) · 5 weeks')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('radio', { name: 'Tuesday' }));
            expect(screen.getByText('Week 1: Sep 1 – Sep 7 · 5 weeks')).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Save Block' }));
            await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
                track_weeks: true, week_start_day: 1,
            })));
        });

        it('opens an existing tracked block with its start day and can switch tracking off', async () => {
            const onSave = renderModal({
                siblingBlocks: [],
                initialData: { ...month, id: 'block-1', track_weeks: true, week_start_day: 0 },
            });

            expect(screen.getByRole('radio', { name: 'Monday' })).toBeChecked();
            fireEvent.click(screen.getByRole('checkbox', { name: 'Track weeks' }));
            fireEvent.click(screen.getByRole('button', { name: 'Save Block' }));

            await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
                track_weeks: false, week_start_day: 0,
            })));
        });
    });
});
