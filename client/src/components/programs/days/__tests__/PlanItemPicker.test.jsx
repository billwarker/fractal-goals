import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const createCircuit = vi.fn();
vi.mock('../../../../hooks/useCircuitQueries', () => ({
    useCircuitDefinitionMutations: () => ({ createMutation: { mutateAsync: createCircuit, isPending: false } }),
}));
// The builders are covered by their own tests; stubs show what the picker hands them.
vi.mock('../../../ActivityBuilder', () => ({
    default: ({ editingActivity, initialSelectedGoalIds, onSave, onClose }) => (
        <div role="dialog" aria-label="Activity builder">
            <span>Draft: {editingActivity?.name || '(blank)'}</span>
            <span>Goals: {initialSelectedGoalIds.join(',') || '(none)'}</span>
            <button type="button" onClick={async () => { await onSave({ id: 'new-act', name: editingActivity?.name }); onClose(); }}>
                Save activity
            </button>
        </div>
    ),
}));
vi.mock('../../../circuits/CircuitBuilderModal', () => ({
    default: ({ circuit, onSave, errorMessage }) => (
        <div role="dialog" aria-label="Circuit builder">
            <span>Circuit: {circuit?.name || '(blank)'}</span>
            {errorMessage ? <p role="alert">{errorMessage}</p> : null}
            <button type="button" onClick={() => onSave({ name: circuit?.name || 'New circuit', slots: [] })}>Save circuit</button>
        </div>
    ),
}));

import PlanItemPicker from '../PlanItemPicker';

const activities = [
    { id: 'fl', name: 'Adv. Tuck FL Holds', associated_goal_ids: ['lever'] },
    { id: 'pike', name: 'Pike Push Ups', associated_goal_ids: [] },
];
const circuits = [{ id: 'circ', name: 'Core Finisher', slots: [{ id: 's', activity_definition_id: 'pike', activity: { name: 'Pike Push Ups' } }] }];

function renderPicker(props = {}) {
    const onAdd = vi.fn();
    render(
        <PlanItemPicker
            rootId="root"
            section={{ name: 'Main' }}
            activities={activities}
            circuits={circuits}
            activityGroups={[]}
            defaultGoalIds={['day-goal']}
            onAdd={onAdd}
            {...props}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
    return { onAdd };
}

beforeEach(() => createCircuit.mockReset());

describe('PlanItemPicker', () => {
    it('creates an activity from a search with no match, defaulting to the day goals, and adds it to the draft', async () => {
        const { onAdd } = renderPicker();
        fireEvent.change(screen.getByPlaceholderText('Search activities...'), { target: { value: 'Planche leans' } });
        fireEvent.click(screen.getByRole('button', { name: /Create New Activity Definition "Planche leans"/ }));

        const builder = await screen.findByRole('dialog', { name: 'Activity builder' });
        expect(builder).toHaveTextContent('Draft: Planche leans');
        expect(builder).toHaveTextContent('Goals: day-goal');
        fireEvent.click(screen.getByRole('button', { name: 'Save activity' }));

        await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ id: 'new-act', name: 'Planche leans' }));
        expect(screen.getByRole('button', { name: '+ Add activity' })).toBeInTheDocument();
    });

    it('creates a circuit and adds the saved definition, keeping the builder open with the error on failure', async () => {
        const { onAdd } = renderPicker();
        fireEvent.click(screen.getByRole('tab', { name: 'Activity Circuits' }));
        fireEvent.click(screen.getByRole('button', { name: '+ Create New Activity Circuit' }));
        createCircuit.mockRejectedValueOnce({ response: { data: { error: 'Name taken' } } });

        fireEvent.click(await screen.findByRole('button', { name: 'Save circuit' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Name taken');
        expect(onAdd).not.toHaveBeenCalled();

        createCircuit.mockResolvedValueOnce({ data: { id: 'circ-2', name: 'New circuit' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save circuit' }));
        await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ circuit_definition_id: 'circ-2', name: 'New circuit' }));
        expect(createCircuit).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole('dialog', { name: 'Circuit builder' })).not.toBeInTheDocument();
    });

    it("narrows choices to the scoped goal's activities, and defaults new activities to that goal", async () => {
        const onClear = vi.fn();
        renderPicker({
            activityGoalScope: {
                goal: { id: 'lever', name: 'Front lever' }, activityIds: ['fl'], isLoading: false, isError: false, onClear,
            },
        });

        expect(screen.getByText('Adv. Tuck FL Holds')).toBeInTheDocument();
        expect(screen.queryByText('Pike Push Ups')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Clear scope' }));
        expect(onClear).toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: '+ Create New Activity Definition' }));
        expect(await screen.findByRole('dialog', { name: 'Activity builder' })).toHaveTextContent('Goals: lever');
    });
});
