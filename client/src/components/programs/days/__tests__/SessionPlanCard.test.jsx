import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../../utils/api', () => ({
    fractalApi: {
        getActivityTagCatalog: vi.fn(() => Promise.resolve({ data: {
            families: [],
            tags: [
                { id: 'tag-paused', name: 'Paused', archived: false },
                { id: 'tag-top', name: 'Top set', archived: false },
            ],
        } })),
    },
}));

import SessionPlanCard from '../SessionPlanCard';

const bench = {
    id: 'bench', name: 'Bench Press', has_sets: true,
    metric_definitions: [{ id: 'w', name: 'Weight', unit: 'kg' }],
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

    it('lists planned tags by name on a past, read-only plan', async () => {
        const tagged = {
            ...entry,
            sections: [{ name: 'Main', items: [{
                ...entry.sections[0].items[0],
                prescription: { schema: 1, tags: ['tag-paused'], sets: [{ metrics: [], tags: ['tag-top'] }] },
            }] }],
        };
        const { card } = renderCard({ entry: tagged, readOnly: true });
        // The same tag chips a live plan shows, named from the catalog, without the picker.
        expect(await within(card).findByText('Paused')).toBeInTheDocument();
        expect(within(card).getByText('Top set')).toBeInTheDocument();
        expect(within(card).queryByRole('button', { name: 'Add tag' })).not.toBeInTheDocument();
    });
});

describe('SessionPlanCard and the Goals side pane', () => {
    it('activates on click and, while active, reports what it plans and the scoped activity', () => {
        const onActivate = vi.fn();
        const onReport = vi.fn();
        const { card } = renderCard({ isActive: true, onActivate, onReport });

        expect(onReport).toHaveBeenLastCalledWith({
            date: '2026-10-05', templateId: 'tmpl', templateName: 'Bench Day', readOnly: false,
            activityIds: ['bench'], selectedActivityId: null,
        });
        fireEvent.click(within(card).getByText('Bench Press'));
        expect(onActivate).toHaveBeenCalled();
        expect(onReport).toHaveBeenLastCalledWith(expect.objectContaining({ selectedActivityId: 'bench' }));
    });

    it('reports nothing while another card is active', () => {
        const onReport = vi.fn();
        renderCard({ isActive: false, onActivate: vi.fn(), onReport });
        expect(onReport).not.toHaveBeenCalled();
    });

    it("lets a past plan's activity be picked to show its goals, without editing it", () => {
        const onReport = vi.fn();
        const { card } = renderCard({ readOnly: true, isActive: true, onActivate: vi.fn(), onReport });

        fireEvent.click(within(card).getByText('Bench Press'));
        expect(onReport).toHaveBeenLastCalledWith(expect.objectContaining({ readOnly: true, selectedActivityId: 'bench' }));
        expect(within(card).queryByRole('button', { name: '+ Add set' })).not.toBeInTheDocument();
        expect(within(card).queryByLabelText(/Coaching note/)).not.toBeInTheDocument();
    });
});

describe('SessionPlanCard selection', () => {
    const row = { id: 'row', name: 'Barbell Row', has_sets: true, metric_definitions: [{ id: 'w', name: 'Weight', unit: 'kg' }] };
    const circuit = { id: 'circ', name: 'Superset', slots: [
        { id: 'slot-bench', activity_definition_id: 'bench', sort_order: 0 },
        { id: 'slot-row', activity_definition_id: 'row', sort_order: 1 },
    ] };
    const circuitEntry = {
        ...entry,
        sections: [{ name: 'Main', items: [
            ...entry.sections[0].items,
            {
                type: 'circuit', circuit_definition_id: 'circ', name: 'Superset', item_key: 'k2',
                prescription: { schema: 1, rounds: [{ slots: [] }, { slots: [] }] },
            },
        ] }],
    };
    const renderCircuitCard = (props = {}) => renderCard({
        entry: circuitEntry,
        activityById: new Map([['bench', bench], ['row', row]]),
        activities: [bench, row],
        circuitById: new Map([['circ', circuit]]),
        isActive: true,
        onActivate: vi.fn(),
        ...props,
    });

    it('selects an activity within a circuit round, as on the session page', () => {
        const onReport = vi.fn();
        const { card } = renderCircuitCard({ onReport });

        fireEvent.click(within(card).getByRole('button', { name: 'Round 2 Barbell Row' }));
        expect(within(card).getByRole('button', { name: 'Round 2 Barbell Row, selected' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(card).getByRole('button', { name: 'Round 2, selected' })).toBeInTheDocument();
        expect(onReport).toHaveBeenLastCalledWith(expect.objectContaining({ selectedActivityId: 'row' }));

        // Clicking the selected member again goes back to its round.
        fireEvent.click(within(card).getByRole('button', { name: 'Round 2 Barbell Row, selected' }));
        expect(within(card).getByRole('button', { name: 'Round 2 Barbell Row' })).toHaveAttribute('aria-pressed', 'false');
        expect(onReport).toHaveBeenLastCalledWith(expect.objectContaining({ selectedActivityId: null }));
    });

    it("selects a past circuit's members for their goals, without editing", () => {
        const onReport = vi.fn();
        const { card } = renderCircuitCard({ onReport, readOnly: true });

        fireEvent.click(within(card).getByRole('button', { name: 'Round 1 Bench Press' }));
        expect(onReport).toHaveBeenLastCalledWith(expect.objectContaining({ selectedActivityId: 'bench' }));
        expect(within(card).queryByRole('button', { name: '+ Add round' })).not.toBeInTheDocument();
        fireEvent.click(within(card).getByRole('button', { name: 'Round 2' }));
        expect(within(card).getByRole('button', { name: 'Round 2, selected' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(card).getByRole('button', { name: 'Round 1 Bench Press' })).toHaveAttribute('aria-pressed', 'false');
        expect(onReport).toHaveBeenLastCalledWith(expect.objectContaining({ selectedActivityId: null }));
        fireEvent.click(within(card).getByRole('button', { name: 'Round 2, selected' }));
        expect(within(card).getByRole('button', { name: 'Round 2' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('tags the circuit, a selected round, and a selected round member', async () => {
        const { card, mutations } = renderCircuitCard();
        const addTag = async (group, tagName) => {
            fireEvent.click(within(group).getByRole('button', { name: 'Add tag' }));
            fireEvent.click(await screen.findByRole('checkbox', { name: tagName }));
            fireEvent.keyDown(document, { key: 'Escape' });
        };

        fireEvent.click(within(card).getByText('Superset', { selector: 'span' }));
        await addTag(within(card).getByRole('group', { name: 'Circuit tags' }), 'Paused');
        // A round's and a member's tags are editable only once selected.
        expect(within(card).queryByRole('group', { name: 'Round 2 tags' })).not.toBeInTheDocument();
        expect(within(card).queryByRole('group', { name: 'Round 2 Barbell Row tags' })).not.toBeInTheDocument();

        fireEvent.click(within(card).getByRole('button', { name: 'Round 2' }));
        await addTag(within(card).getByRole('group', { name: 'Round 2 tags' }), 'Top set');

        fireEvent.click(within(card).getByRole('button', { name: 'Round 2 Barbell Row' }));
        expect(within(card).queryByRole('group', { name: 'Round 2 tags' })).toBeInTheDocument();
        const memberTags = within(card).getByRole('group', { name: 'Round 2 Barbell Row tags' });
        // The circuit's and round's tags are inherited here, so they aren't offered again.
        fireEvent.click(within(memberTags).getByRole('button', { name: 'Add tag' }));
        const picker = await screen.findByRole('dialog', { name: 'Choose round 2 barbell row tags' });
        expect(within(picker).queryByRole('checkbox', { name: 'Paused' })).not.toBeInTheDocument();
        expect(within(picker).queryByRole('checkbox', { name: 'Top set' })).not.toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });

        fireEvent.click(within(card).getByRole('button', { name: 'Save plan' }));
        const { sections } = mutations.save.mutate.mock.calls[0][0];
        expect(sections[0].items[1].prescription).toEqual({
            schema: 1,
            tags: ['tag-paused'],
            rounds: [{ slots: [], notes: null }, { slots: [], notes: null, tags: ['tag-top'] }],
        });
    });

    it("shows a past circuit's planned tags without editing them", async () => {
        const tagged = {
            ...circuitEntry,
            sections: [{ name: 'Main', items: [{
                ...circuitEntry.sections[0].items[1],
                prescription: { schema: 1, tags: ['tag-paused'], rounds: [
                    { slots: [{ slot_id: 'slot-row', metrics: [], tags: ['tag-top'] }], notes: null },
                ] },
            }] }],
        };
        const { card } = renderCircuitCard({ entry: tagged, readOnly: true });

        expect(await within(within(card).getByRole('group', { name: 'Circuit tags' })).findByText('Paused')).toBeInTheDocument();
        expect(await within(within(card).getByRole('group', { name: 'Round 1 Barbell Row tags' })).findByText('Top set'))
            .toBeInTheDocument();
        expect(within(card).queryByRole('button', { name: 'Add tag' })).not.toBeInTheDocument();
    });

    it("deselects when the card's empty space is clicked", () => {
        const onReport = vi.fn();
        const { card } = renderCircuitCard({ onReport });

        fireEvent.click(within(card).getByText('Bench Press', { selector: 'span' }));
        expect(card.querySelector('[data-plan-item][data-selected="true"]')).not.toBeNull();
        fireEvent.click(within(card).getByRole('heading', { name: 'Main' }));
        expect(card.querySelector('[data-plan-item][data-selected="true"]')).toBeNull();
        expect(onReport).toHaveBeenLastCalledWith(expect.objectContaining({ selectedActivityId: null }));

        // Controls and the activity picker never deselect.
        fireEvent.click(within(card).getByRole('button', { name: 'Round 1 Bench Press' }));
        fireEvent.click(within(card).getAllByRole('button', { name: '+ Add activity' })[0]);
        expect(card.querySelector('[data-plan-item][data-selected="true"]')).not.toBeNull();
    });
});

describe('SessionPlanCard copy and comparison', () => {
    const yieldBench = {
        ...bench,
        metric_definitions: [
            { id: 'w', name: 'Weight', unit: 'kg', is_multiplicative: true, is_additive: false },
            { id: 'r', name: 'Reps', unit: 'reps', is_multiplicative: true },
        ],
    };
    const plannedSet = (w, r) => ({ metrics: [
        { metric_id: 'w', split_id: null, value: w }, { metric_id: 'r', split_id: null, value: r },
    ] });
    const target = {
        ...entry,
        date: '2099-10-23',
        sections: [{ name: 'Main', items: [{
            type: 'activity', activity_definition_id: 'bench', name: 'Bench Press', item_key: 'k1',
            prescription: { schema: 1, sets: [plannedSet(105, 5), plannedSet(100, 5)] },
        }] }],
    };
    const comparison = {
        date: '2099-10-16',
        kind: 'logged',
        isLoading: false,
        sections: [{ name: 'Main', items: [{
            type: 'activity', activity_definition_id: 'bench', name: 'Bench Press',
            prescription: { sets: [{ ...plannedSet(100, 5), notes: 'grind' }], metrics: [], notes: 'felt heavy' },
        }] }],
    };
    const renderCompared = (props = {}) => renderCard({
        entry: target, comparison, activityById: new Map([['bench', yieldBench]]), elementId: 'card', ...props,
    });

    it('shows set and total yield changes from the compared card', () => {
        const { card } = renderCompared();
        expect(within(card).getByLabelText('Set 1 yield up 5% from Fri, Oct 16')).toHaveTextContent('▲5%');
        expect(within(card).getByLabelText('Set 2 is new from Fri, Oct 16')).toBeInTheDocument();
        const summary = within(card).getByLabelText('Activity summary metrics');
        expect(within(summary).getByText('Total yield:').closest('div')).toHaveTextContent('1025 (▲105%)');
        expect(within(summary).getByText('Best:').closest('div')).toHaveTextContent('Set 1 = 525');
    });

    it('copies the compared values into an unsaved draft without notes, then saves them', () => {
        const { card, mutations } = renderCompared();
        fireEvent.click(within(card).getByRole('button', { name: '← Copy from Fri, Oct 16' }));
        // The button itself shows the copy; no banner.
        expect(within(card).getByRole('button', { name: '← Copied from Fri, Oct 16' })).toBeEnabled();
        expect(within(card).getByRole('status')).toHaveTextContent('Copied from Fri, Oct 16. Review, then Save.');
        expect(within(card).queryByText('Copied from Fri, Oct 16. Review, then Save.', { selector: ':not([role="status"])' }))
            .not.toBeInTheDocument();
        expect(within(card).queryByText('felt heavy')).not.toBeInTheDocument();
        expect(within(card).queryByLabelText(/Set 2/)).not.toBeInTheDocument();
        fireEvent.click(within(card).getByRole('button', { name: 'Save plan' }));
        expect(mutations.save.mutate).toHaveBeenCalledWith(expect.objectContaining({
            templateId: 'tmpl',
            sections: [{ name: 'Main', items: [{
                type: 'activity', activity_definition_id: 'bench', name: 'Bench Press', item_key: 'k1',
                prescription: { schema: 1, sets: [{ metrics: plannedSet(100, 5).metrics, notes: null }] },
            }] }],
        }), expect.anything());
        fireEvent.click(within(card).getByRole('button', { name: 'Discard' }));
        expect(within(card).getByRole('button', { name: '← Copy from Fri, Oct 16' })).toBeInTheDocument();
        expect(within(card).getByRole('status')).toBeEmptyDOMElement();
    });

    it("says on the button what a copy couldn't bring over", () => {
        const withDeleted = {
            ...comparison,
            sections: [{ name: 'Main', items: [
                ...comparison.sections[0].items,
                { type: 'activity', activity_definition_id: 'gone', name: 'Old Lift', prescription: { sets: [] } },
            ] }],
        };
        const { card } = renderCompared({ comparison: withDeleted });
        fireEvent.click(within(card).getByRole('button', { name: '← Copy from Fri, Oct 16' }));
        const button = within(card).getByRole('button', { name: '← Copied from Fri, Oct 16 · 1 not copied' });
        expect(button).toHaveAttribute('title', expect.stringContaining("Old Lift wasn't copied: this activity was deleted."));
        expect(within(card).getByRole('status')).toHaveTextContent("Old Lift wasn't copied: this activity was deleted.");
    });

    it('asks before replacing unsaved edits', () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const { card } = renderCompared();
        fireEvent.click(within(card).getByRole('button', { name: 'Remove Bench Press from this plan' }));
        fireEvent.click(within(card).getByRole('button', { name: '← Copy from Fri, Oct 16' }));
        expect(confirm).toHaveBeenCalledWith('Replace your unsaved changes with the plan from Fri, Oct 16?');
        expect(within(card).queryByRole('button', { name: /Copied from/ })).not.toBeInTheDocument();
        confirm.mockRestore();
    });

    it('disables Copy once a session started from the plan', () => {
        const { card } = renderCompared({ entry: { ...target, executed_sessions: [{ id: 's', name: 'Bench Day', completed: false }] } });
        const button = within(card).getByRole('button', { name: '← Copy from Fri, Oct 16' });
        expect(button).toBeDisabled();
        expect(button).toHaveAccessibleDescription('A session has already started from this plan.');
    });

    it('hides Copy on a past date', () => {
        renderCompared({ readOnly: true });
        expect(screen.queryByRole('button', { name: /Copy from/ })).not.toBeInTheDocument();
    });

    it('hides Copy without a comparison', () => {
        renderCard({ entry: target });
        expect(screen.queryByRole('button', { name: /Copy from/ })).not.toBeInTheDocument();
        expect(screen.queryByText(/[▲▼]/)).not.toBeInTheDocument();
    });
});
