import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import FilterModal, { keywordTerms } from '../FilterModal';

const current = { categories: [], pinnedOnly: false, goalIds: [], activityIds: [] };

describe('FilterModal', () => {
    it('splits search text like the server', () => {
        expect(keywordTerms('elbow "stack scapula" 100%')).toEqual(['elbow', 'stack scapula', '100%']);
    });

    it('needs a name and a condition', () => {
        render(<FilterModal current={current} onSubmit={vi.fn()} onClose={vi.fn()} />);
        const create = screen.getByRole('button', { name: 'Create filter' });
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Empty' } });
        expect(create).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Condition 1 text'), { target: { value: 'elbow' } });
        expect(create).not.toBeDisabled();
    });

    it('builds AND/OR conditions with contains and equals', async () => {
        const onSubmit = vi.fn().mockResolvedValue();
        render(<FilterModal searchText="elbow" current={{ ...current, goalIds: ['g1'] }} onSubmit={onSubmit} onClose={vi.fn()} />);
        expect(screen.queryByRole('radiogroup', { name: 'Match' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '+ Add condition' }));
        fireEvent.change(screen.getByLabelText('Condition 2 match'), { target: { value: 'equals' } });
        fireEvent.change(screen.getByLabelText('Condition 2 text'), { target: { value: 'lockout' } });
        fireEvent.click(screen.getByRole('radio', { name: 'Match any (OR)' }));
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Either' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create filter' }));
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Either', {
            conditions: [{ op: 'contains', value: 'elbow' }, { op: 'equals', value: 'lockout' }], match: 'any',
            categories: undefined, pinned_only: undefined, goal_ids: ['g1'], activity_definition_ids: undefined, activity_group_ids: undefined,
        }));
    });

    it('removes conditions and keeps the dialog open on a server error', async () => {
        const onClose = vi.fn();
        render(<FilterModal searchText="a b" current={current} onClose={onClose}
            onSubmit={vi.fn().mockRejectedValue({ response: { data: { error: 'A saved filter with that name already exists' } } })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Remove condition 2' }));
        expect(screen.queryByLabelText('Condition 2 text')).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dup' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create filter' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
        expect(onClose).not.toHaveBeenCalled();
    });
});
