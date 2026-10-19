import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import GoalSequenceSubView from '../GoalSequenceSubView';

const { mutations, sequenceData } = vi.hoisted(() => ({
    mutations: { createTrack: vi.fn(), setSteps: vi.fn(), dissolveTrack: vi.fn(), isSaving: false },
    sequenceData: { current: null },
}));
vi.mock('../../../hooks/useGoalSequenceQueries', () => ({
    useGoalSequence: (_rootId, _goalId, { enabled }) => ({ data: enabled ? sequenceData.current : undefined, isLoading: false }),
    useSequenceTrackMutations: () => mutations,
}));

const child = (id, extra = {}) => ({ id, name: `Goal ${id}`, level_id: 'mid', parent_id: 'p', children: [], ...extra });
const tree = (children) => ({ id: 'root', children: [{ id: 'p', name: 'Parent', children }] });

function renderView(goal, children, props = {}) {
    const onDone = vi.fn();
    render(<GoalSequenceSubView rootId="r" goal={goal} goalId={goal.id} treeData={tree(children)} onBack={vi.fn()} onDone={onDone} {...props} />);
    return { onDone };
}

describe('GoalSequenceSubView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.values(mutations).forEach((fn) => typeof fn === 'function' && fn.mockResolvedValue({}));
        sequenceData.current = null;
    });

    it('creates a sequence from same-level siblings in the drafted order', async () => {
        const goal = child('a');
        const { onDone } = renderView(goal, [goal, child('b'), child('c'), child('other-level', { level_id: 'short' })]);

        expect(screen.getByRole('button', { name: 'Create sequence' })).toBeDisabled();
        expect(screen.queryByRole('button', { name: '+ Goal other-level' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '+ Goal c' }));
        fireEvent.click(screen.getByRole('button', { name: '+ Goal b' }));
        fireEvent.click(screen.getByRole('button', { name: 'Move Goal b earlier' }));
        expect(within(screen.getByRole('list', { name: 'Sequence order' })).getAllByRole('listitem').map((item) => item.textContent))
            .toEqual([expect.stringContaining('Goal a'), expect.stringContaining('Goal b'), expect.stringContaining('Goal c')]);

        fireEvent.click(screen.getByRole('button', { name: 'Create sequence' }));
        await waitFor(() => expect(onDone).toHaveBeenCalled());
        expect(mutations.createTrack).toHaveBeenCalledWith('p', ['a', 'b', 'c']);
    });

    it('offers to join a sibling sequence', async () => {
        const goal = child('c');
        renderView(goal, [child('a', { sequence_track_id: 't', sequence_position: 1 }), child('b', { sequence_track_id: 't', sequence_position: 2 }), goal]);

        fireEvent.click(screen.getByRole('button', { name: /Join sequence/ }));
        expect(screen.getByText('Goal a → Goal b → Goal c')).toBeInTheDocument();
        await waitFor(() => expect(mutations.setSteps).toHaveBeenCalledWith('t', ['a', 'b', 'c']));
    });

    it('reorders, removes and dissolves an existing sequence', async () => {
        const goal = child('b', { sequence_track_id: 't', sequence_position: 2 });
        sequenceData.current = { steps: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
        renderView(goal, [
            child('a', { sequence_track_id: 't', sequence_position: 1, completed: true }), goal,
            child('c', { sequence_track_id: 't', sequence_position: 3 }),
        ]);

        const items = within(screen.getByRole('list', { name: 'Sequence order' })).getAllByRole('listitem');
        expect(items.map((item) => item.textContent)).toEqual([
            expect.stringContaining('Done'), expect.stringContaining('Active'), expect.stringContaining('Waits'),
        ]);
        expect(screen.getByRole('button', { name: 'Save order' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Move Goal c earlier' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove Goal a from the sequence' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
        await waitFor(() => expect(mutations.setSteps).toHaveBeenCalledWith('t', ['c', 'b']));

        fireEvent.click(screen.getByRole('button', { name: 'Stop sequencing' }));
        await waitFor(() => expect(mutations.dissolveTrack).toHaveBeenCalledWith('t'));
    });

    it('explains when there is nothing to sequence with', () => {
        const goal = child('a');
        renderView(goal, [goal, child('b', { level_id: 'short' })]);
        expect(screen.getByText('No sibling goals at this level to sequence with.')).toBeInTheDocument();
    });
});
