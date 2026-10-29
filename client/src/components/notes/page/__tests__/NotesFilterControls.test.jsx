import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import categories from '../../../../../../tests/fixtures/note_categories.json';
import { deriveNoteCategory, NOTE_CATEGORIES } from '../../../../utils/noteTypes';
import NotesFilterControls from '../NotesFilterControls';

const heatmap = vi.hoisted(() => ({ value: { data: null, isLoading: false } }));
vi.mock('../../../../hooks/useNotesPageQuery', () => ({ useNotesHeatmap: () => heatmap.value }));

const base = { text: '', categories: [], goalIds: [], activityIds: [], pinnedOnly: false, savedFilterIds: [], day: null };
const saved = (overrides = {}) => ({ savedFilters: [], activeIds: [], onToggle: vi.fn(), onCreate: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(), ...overrides });
const renderControls = (filters = {}, extra = {}) => {
    const updateFilters = vi.fn();
    render(<NotesFilterControls rootId="root" filters={{ ...base, ...filters }} apiFilters={{}} updateFilters={updateFilters}
        goalSummary="" activitySummary="" onPickGoal={vi.fn()} onPickActivities={vi.fn()} saved={saved()} {...extra} />);
    return updateFilters;
};

beforeEach(() => { heatmap.value = { data: { days: [{ date: '2026-10-23', count: 2 }, { date: '2026-10-22', count: 0 }], total: 2, max_count: 2, range_start: '2026-10-22' }, isLoading: false }; });
afterEach(() => vi.useRealTimers());

describe('NotesFilterControls', () => {
    it('mirrors the server categories and their context types', () => {
        expect(NOTE_CATEGORIES).toEqual(categories.map(({ value, label, context_types: contextTypes }) => (
            { value, label, contextTypes }
        )));
        categories.forEach(({ value, context_types: contextTypes }) => {
            contextTypes.forEach((contextType) => expect(deriveNoteCategory(contextType)).toBe(value));
        });
        expect(deriveNoteCategory('unknown_context')).toBe('general');
    });

    it('orders sections heatmap, search, saved filters with Sessions-style headers and no search mode toggle', () => {
        renderControls();
        expect(screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent))
            .toEqual(['Notes Heatmap', 'Search', 'Saved Filters', 'Categories', 'Goal & Activity']);
        expect(screen.queryByRole('radiogroup', { name: 'Search mode' })).not.toBeInTheDocument();
    });

    it('presents categories as a multi-select with no "All" option', () => {
        const update = renderControls({ categories: ['goals'] });
        const group = screen.getByRole('group', { name: 'Categories' });
        expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['General', '✓Goals', 'Sessions', 'Programs']);  // ✓ marks the selected option.
        expect(within(group).queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
        fireEvent.click(within(group).getByRole('button', { name: 'Sessions' }));
        expect(update).toHaveBeenLastCalledWith({ categories: ['goals', 'sessions'] });
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
        expect(update).toHaveBeenLastCalledWith({ categories: [] });
    });

    it('says "Any" when no category is chosen', () => {
        renderControls();
        expect(screen.getByText('Any', { selector: 'span' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    });

    it('commits search after typing pauses', () => {
        vi.useFakeTimers();
        const update = renderControls();
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes' }), { target: { value: 'elbow' } });
        expect(update).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(300));
        expect(update).toHaveBeenCalledWith({ text: 'elbow' });
    });

    it('selects and clears heatmap days', () => {
        const update = renderControls({ day: '2026-10-23' });
        expect(screen.getByText(/Showing Oct 23, 2026/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '2026-10-23: 2 notes' }));
        expect(update).toHaveBeenLastCalledWith({ day: null });
        fireEvent.click(screen.getByRole('button', { name: 'Show all days' }));
        expect(update).toHaveBeenLastCalledWith({ day: null });
    });

    it('creates a filter from the typed search, one contains-condition per word or phrase', async () => {
        const onCreate = vi.fn().mockResolvedValue();
        renderControls({ categories: ['sessions'] }, { saved: saved({ onCreate }) });
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search notes' }), { target: { value: 'elbow "lock out"' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create filter' }));
        const dialog = screen.getByRole('dialog', { name: 'Create filter' });
        expect(within(dialog).getByLabelText('Condition 1 text')).toHaveValue('elbow');
        expect(within(dialog).getByLabelText('Condition 2 text')).toHaveValue('lock out');
        fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Lockout' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Create filter' }));
        await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Lockout', expect.objectContaining({
            conditions: [{ op: 'contains', value: 'elbow' }, { op: 'contains', value: 'lock out' }], match: 'all', categories: ['sessions'],
        })));
    });

    it('edits a saved filter from its chip menu', async () => {
        const onUpdate = vi.fn().mockResolvedValue();
        const filter = { id: 'f1', name: 'YouTube', spec: { text: 'youtube' } };
        renderControls({}, { saved: saved({ savedFilters: [filter], onUpdate }) });
        fireEvent.click(screen.getByRole('button', { name: 'YouTube options' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
        const dialog = screen.getByRole('dialog', { name: 'Edit filter' });
        expect(within(dialog).getByLabelText('Name')).toHaveValue('YouTube');
        expect(within(dialog).getByLabelText('Condition 1 text')).toHaveValue('youtube');
        fireEvent.change(within(dialog).getByLabelText('Condition 1 match'), { target: { value: 'equals' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(filter, 'YouTube', expect.objectContaining({
            conditions: [{ op: 'equals', value: 'youtube' }],
        })));
    });
});
