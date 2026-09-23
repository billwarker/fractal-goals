import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import CalendarPeriodModal from '../CalendarPeriodModal';

const draft = {
    name: '', kind: 'vacation', start_date: '2026-09-10', end_date: '2026-09-17',
    protects_streaks: true, notes: '', spansGaps: false,
};

function renderModal(overrides = {}) {
    const props = {
        isOpen: true, period: draft, pending: false,
        onClose: vi.fn(), onSubmit: vi.fn(), onDelete: vi.fn(),
        ...overrides,
    };
    render(<CalendarPeriodModal {...props} />);
    return props;
}

describe('CalendarPeriodModal', () => {
    it('creates an event prefilled from the calendar selection', () => {
        const props = renderModal();

        expect(screen.getByRole('dialog', { name: 'Plan event' })).toBeInTheDocument();
        expect(screen.getByLabelText('Start date')).toHaveValue('2026-09-10');
        expect(screen.getByLabelText('End date')).toHaveValue('2026-09-17');
        expect(screen.getByRole('checkbox', { name: 'Protect streaks' })).toBeChecked();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Lisbon  ' } });
        fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'travel' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add event' }));

        expect(props.onSubmit).toHaveBeenCalledWith({
            name: 'Lisbon', kind: 'travel', start_date: '2026-09-10', end_date: '2026-09-17',
            protects_streaks: true, notes: '',
        });
    });

    it('validates name, date order, and maximum span before submitting', () => {
        const props = renderModal({ period: { ...draft, end_date: '2026-09-01' } });

        fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
        expect(screen.getByText('Give this event a name.')).toBeInTheDocument();
        expect(screen.getByText('End date must be on or after the start date.')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Long' } });
        fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-09-11' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
        expect(screen.getByText('Events can span at most 366 days.')).toBeInTheDocument();
        expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it('explains gaps in a non-contiguous selection', () => {
        renderModal({ period: { ...draft, spansGaps: true } });

        expect(screen.getByRole('status')).toHaveTextContent('Your selection has gaps');
    });

    it('edits and removes an existing event with inline confirmation', () => {
        const period = { ...draft, id: 'p1', name: 'Lisbon', protects_streaks: false };
        const props = renderModal({ period });

        expect(screen.getByRole('dialog', { name: 'Edit event' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Protect streaks' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save event' }));
        expect(props.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', protects_streaks: true }));

        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Remove this event?');
        fireEvent.click(screen.getByRole('button', { name: 'Remove event' }));
        expect(props.onDelete).toHaveBeenCalledWith(period);
    });
});
