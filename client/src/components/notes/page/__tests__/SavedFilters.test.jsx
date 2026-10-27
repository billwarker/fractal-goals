import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SavedFilters from '../SavedFilters';

const filters = [{ id: 'f1', name: 'Form cues' }, { id: 'f2', name: 'Injuries' }];
const props = (overrides = {}) => ({ savedFilters: filters, activeIds: [], onToggle: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn().mockResolvedValue(), ...overrides });

describe('SavedFilters', () => {
    it('shows compact toggles and explains AND', () => {
        const handlers = props({ activeIds: ['f1', 'f2'] });
        render(<SavedFilters {...handlers} />);
        expect(screen.getByRole('button', { name: 'Form cues' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('Showing notes that match all selected filters.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Injuries' }));
        expect(handlers.onToggle).toHaveBeenCalledWith('f2');
    });

    it('edits and deletes from the chip menu', async () => {
        const handlers = props();
        render(<SavedFilters {...handlers} />);
        fireEvent.click(screen.getByRole('button', { name: 'Form cues options' }));
        expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Edit…', 'Delete']);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Edit…' }));
        expect(handlers.onEdit).toHaveBeenCalledWith(filters[0]);
        fireEvent.click(screen.getByRole('button', { name: 'Injuries options' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
        const confirm = screen.getByRole('group', { name: 'Confirm deleting Injuries' });
        fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(handlers.onDelete).toHaveBeenCalledWith(filters[1]));
    });

    it('explains how to create the first filter', () => {
        render(<SavedFilters {...props({ savedFilters: [] })} />);
        expect(screen.getByText(/filter button in the search bar/)).toBeInTheDocument();
    });
});
