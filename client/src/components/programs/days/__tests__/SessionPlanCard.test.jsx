import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../../utils/api', () => ({
    fractalApi: { getActivityTagCatalog: vi.fn(() => Promise.resolve({ data: { tags: [] } })) },
}));

import SessionPlanCard from '../SessionPlanCard';

const bench = {
    id: 'bench', name: 'Bench Press', has_sets: true,
    metric_definitions: [{ id: 'w', name: 'Weight', unit: 'kg' }],
    tags: [
        { id: 'tag-paused', name: 'Paused', scope: 'selected', archived: false },
        { id: 'tag-top', name: 'Top set', scope: 'selected', archived: false },
    ],
};

const entry = {
    template: { id: 'tmpl', name: 'Bench Day', color: '#336699', revision: 1 },
    is_required: true,
    date: '2026-10-05',
    plan_id: null,
    row_version: null,
    source: 'template',
    template_changed: false,
    sections: [{ name: 'Main', items: [{
        type: 'activity', activity_definition_id: 'bench', name: 'Bench Press', item_key: 'k1',
        prescription: { schema: 1, sets: [{ metrics: [{ metric_id: 'w', split_id: null, value: 100 }] }] },
    }] }],
    previous: null,
    executed_sessions: [],
};

function renderCard(props = {}) {
    const idle = { mutate: vi.fn(), isPending: false };
    const mutations = { save: { mutate: vi.fn(), isPending: false }, reset: idle, pullTemplate: idle, refresh: vi.fn() };
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter>
                <SessionPlanCard
                    rootId="root"
                    entry={entry}
                    activityById={new Map([['bench', bench]])}
                    activities={[bench]}
                    circuits={[]}
                    activityGroups={[]}
                    mutations={mutations}
                    {...props}
                />
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { mutations, card: screen.getByRole('article', { name: /Bench Day plan/ }) };
}

describe('SessionPlanCard scoping', () => {
    it('scopes the note composer and tags to the clicked activity, then to a clicked set', async () => {
        const { mutations, card } = renderCard();
        // Nothing is scoped yet: no per-set note buttons, composer or tag picker.
        expect(within(card).queryByRole('button', { name: 'Note' })).not.toBeInTheDocument();
        expect(within(card).queryByLabelText('Coaching note for Bench Press')).not.toBeInTheDocument();

        fireEvent.click(within(card).getByText('Bench Press'));
        expect(within(card).getByText('Bench Press').closest('[data-selected]')).toHaveAttribute('data-selected', 'true');
        const activityNote = within(card).getByLabelText('Coaching note for Bench Press');
        fireEvent.change(activityNote, { target: { value: 'Pause at chest' } });
        fireEvent.blur(activityNote);
        fireEvent.click(within(card).getByRole('button', { name: 'Add tag' }));
        fireEvent.click(await screen.findByRole('checkbox', { name: 'Paused' }));
        fireEvent.keyDown(document, { key: 'Escape' });

        fireEvent.click(within(card).getByRole('button', { name: 'Set 1' }));
        expect(within(card).getByRole('button', { name: 'Set 1, selected' })).toHaveAttribute('aria-pressed', 'true');
        const setNote = within(card).getByLabelText('Note for Bench Press · Set 1');
        setNote.focus();
        fireEvent.change(setNote, { target: { value: 'Top single' } });
        fireEvent.keyDown(setNote, { key: 'Enter' });
        const setTags = within(card).getByRole('group', { name: 'Set tags' });
        fireEvent.click(within(setTags).getByRole('button', { name: 'Add tag' }));
        fireEvent.click(await screen.findByRole('checkbox', { name: 'Top set' }));

        // Once a set is scoped, the activity's note shows as text instead of in the composer.
        expect(within(card).getByText('Pause at chest')).toBeInTheDocument();
        fireEvent.click(within(card).getByRole('button', { name: 'Save plan' }));

        const { sections } = mutations.save.mutate.mock.calls[0][0];
        expect(sections[0].items[0].prescription).toMatchObject({
            notes: 'Pause at chest',
            tags: ['tag-paused'],
            sets: [{ notes: 'Top single', tags: ['tag-top'] }],
        });
    });

    it('scopes back to the whole activity from its set label or the activity container', () => {
        const { card } = renderCard();
        fireEvent.click(within(card).getByText('Bench Press'));
        fireEvent.click(within(card).getByRole('button', { name: 'Set 1' }));
        fireEvent.click(within(card).getByRole('button', { name: 'Set 1, selected' }));
        expect(within(card).getByLabelText('Coaching note for Bench Press')).toBeInTheDocument();

        fireEvent.click(within(card).getByLabelText('Set 1 planned Weight'));
        expect(within(card).getByLabelText('Note for Bench Press · Set 1')).toBeInTheDocument();
        // Typing in the scoped note keeps the set scoped.
        fireEvent.click(within(card).getByLabelText('Note for Bench Press · Set 1'));
        expect(within(card).getByRole('button', { name: 'Set 1, selected' })).toBeInTheDocument();
        fireEvent.click(within(card).getByText('Bench Press'));
        expect(within(card).getByLabelText('Coaching note for Bench Press')).toBeInTheDocument();
        expect(within(card).getByRole('button', { name: 'Set 1' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('puts the activity tag button in the item header and each set tag beside its remove button', () => {
        const { card } = renderCard();
        fireEvent.click(within(card).getByText('Bench Press'));
        const header = within(card).getByRole('button', { name: 'Remove Bench Press from this plan' }).parentElement;
        expect(within(header).getByRole('group', { name: 'Activity tags' })).toBeInTheDocument();
        fireEvent.click(within(card).getByRole('button', { name: 'Set 1' }));
        const setRemove = within(card).getByRole('button', { name: 'Remove planned set 1' });
        expect(setRemove.previousElementSibling).toContainElement(within(card).getByRole('group', { name: 'Set tags' }));
    });

    it('lists planned tags by name on a past, read-only plan', () => {
        const tagged = {
            ...entry,
            sections: [{ name: 'Main', items: [{
                ...entry.sections[0].items[0],
                prescription: { schema: 1, tags: ['tag-paused'], sets: [{ metrics: [], tags: ['tag-top'] }] },
            }] }],
        };
        const { card } = renderCard({ entry: tagged, readOnly: true });
        // The same tag chips a live plan shows, without the picker.
        expect(within(card).getByText('Paused')).toBeInTheDocument();
        expect(within(card).getByText('Top set')).toBeInTheDocument();
        expect(within(card).queryByRole('button', { name: 'Add tag' })).not.toBeInTheDocument();
    });
});
