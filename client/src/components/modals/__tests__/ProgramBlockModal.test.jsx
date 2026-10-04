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
});
