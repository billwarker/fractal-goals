import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ActiveFiltersSummary from '../ActiveFiltersSummary';

const none = { text: '', categories: [], goalId: null, goalName: '', activityIds: [], groupIds: [], pinnedOnly: false, day: null };

describe('ActiveFiltersSummary', () => {
    it('names every active filter and sends edits to the side pane', () => {
        const onEdit = vi.fn();
        const onClear = vi.fn();
        render(<ActiveFiltersSummary
            filters={{ ...none, text: 'elbow', categories: ['goals'], pinnedOnly: true, day: '2026-10-23' }}
            savedFilters={[{ id: 'f1', name: 'Form cues' }, { id: 'f2', name: 'Unused' }]} activeSavedIds={['f1']}
            onEdit={onEdit} onClear={onClear} />);
        expect(screen.getByRole('status')).toHaveTextContent('Filtered by Form cues · “elbow” · Goals · Pinned · Oct 23, 2026');
        expect(screen.queryByText(/Unused/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Edit filters' }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
        expect(onEdit).toHaveBeenCalled();
        expect(onClear).toHaveBeenCalled();
    });

    it('renders nothing when unfiltered', () => {
        const { container } = render(<ActiveFiltersSummary filters={none} savedFilters={[]} activeSavedIds={[]} onEdit={vi.fn()} onClear={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });
});
