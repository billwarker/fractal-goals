import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import GoalSequenceSubView from '../GoalSequenceSubView';

const { mutations, sequenceData } = vi.hoisted(() => ({
    mutations: { createTrack: vi.fn(), setSteps: vi.fn(), dissolveTrack: vi.fn(), isSaving: false },
    sequenceData: { current: null },
}));
vi.mock('../../../hooks/useGoalSequenceQueries', () => ({
    useGoalSequence: (_rootId, _goalId, { enabled }) => ({ data: enabled ? sequenceData.current : undefined, isLoading: false }),
    useSequenceTrackMutations: () => mutations,
}));
vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({ getGoalIcon: () => 'circle', getGoalColor: () => '#000', getGoalSecondaryColor: () => '#111' }),
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
        expect(screen.queryByRole('button', { name: 'Add Goal other-level' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Add Goal c' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add Goal b' }));
        fireEvent.click(screen.getByRole('button', { name: 'Move Goal b earlier' }));
        expect(within(screen.getByRole('list', { name: 'Sequence order' })).getAllByRole('listitem').map((item) => item.textContent))
            .toEqual([expect.stringContaining('Goal a'), expect.stringContaining('Goal b'), expect.stringContaining('Goal c')]);

        fireEvent.click(screen.getByRole('button', { name: 'Create sequence' }));
        await waitFor(() => expect(onDone).toHaveBeenCalled());
        expect(mutations.createTrack).toHaveBeenCalledWith('p', ['a', 'b', 'c']);
    });

    it('adds a completed sibling ahead of the first open step so it keeps an early number', async () => {
        const goal = child('a');
        const { onDone } = renderView(goal, [goal, child('b'), child('done', { completed: true })]);

        fireEvent.click(screen.getByRole('button', { name: 'Add Goal b' }));
        const completed = screen.getByRole('button', { name: 'Add Goal done (completed)' });
        expect(completed).toHaveAttribute('data-completed', 'true');
        fireEvent.click(completed);
        const items = within(screen.getByRole('list', { name: 'Sequence order' })).getAllByRole('listitem');
        expect(items.map((item) => item.textContent)).toEqual([
            expect.stringContaining('Goal done'), expect.stringContaining('Goal a'), expect.stringContaining('Goal b'),
        ]);
        expect(items[0]).toHaveTextContent('Done');
        expect(items[1]).toHaveTextContent('Active');

        fireEvent.click(screen.getByRole('button', { name: 'Create sequence' }));
        await waitFor(() => expect(onDone).toHaveBeenCalled());
        expect(mutations.createTrack).toHaveBeenCalledWith('p', ['done', 'a', 'b']);
    });

    it('marks siblings outside the scoped program', () => {
        const goal = child('a');
        renderView(goal, [goal, child('b'), child('c')], { programScope: { goalIds: new Set(['a', 'b']), name: 'Spring Block' } });

        expect(screen.getByRole('note')).toHaveTextContent('1 sibling is outside Spring Block');
        const outside = screen.getByRole('button', { name: 'Add Goal c' });
        expect(within(outside).getByText('Outside program')).toBeInTheDocument();
        expect(within(screen.getByRole('button', { name: 'Add Goal b' })).queryByText('Outside program')).not.toBeInTheDocument();
    });

    it('puts Create sequence in the host footer instead of the content', async () => {
        const registerFooterAction = vi.fn();
        const goal = child('a');
        const { onDone } = renderView(goal, [goal, child('b')], { registerFooterAction });

        expect(screen.queryByRole('button', { name: 'Create sequence' })).not.toBeInTheDocument();
        expect(registerFooterAction).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'Create sequence', disabled: true }));
        fireEvent.click(screen.getByRole('button', { name: 'Add Goal b' }));
        const action = registerFooterAction.mock.calls.at(-1)[0];
        expect(action.disabled).toBe(false);

        await act(async () => action.onClick());
        expect(mutations.createTrack).toHaveBeenCalledWith('p', ['a', 'b']);
        expect(onDone).toHaveBeenCalled();
    });

    it('reorders steps by dragging their grip', () => {
        const goal = child('a');
        renderView(goal, [goal, child('b'), child('c')]);
        fireEvent.click(screen.getByRole('button', { name: 'Add Goal b' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add Goal c' }));
        const list = screen.getByRole('list', { name: 'Sequence order' });
        const items = within(list).getAllByRole('listitem');
        items.forEach((item, index) => {
            item.getBoundingClientRect = () => ({ top: index * 40, height: 40, bottom: (index + 1) * 40 });
        });
        const grip = items[0].querySelector('[data-reorder-handle]');

        fireEvent.pointerDown(grip, { button: 0, pointerId: 1 });
        fireEvent.pointerMove(grip, { clientY: 95, pointerId: 1 });
        expect(items[2]).toHaveAttribute('data-drop', 'after');
        fireEvent.pointerUp(grip, { pointerId: 1 });

        expect(within(list).getAllByRole('listitem').map((item) => item.textContent))
            .toEqual([expect.stringContaining('Goal b'), expect.stringContaining('Goal c'), expect.stringContaining('Goal a')]);
    });

    it('lets a mouse drag from the card body but not from its buttons', () => {
        const goal = child('a');
        renderView(goal, [goal, child('b')]);
        fireEvent.click(screen.getByRole('button', { name: 'Add Goal b' }));
        const list = screen.getByRole('list', { name: 'Sequence order' });
        const items = within(list).getAllByRole('listitem');
        items.forEach((item, index) => {
            item.getBoundingClientRect = () => ({ top: index * 40, height: 40, bottom: (index + 1) * 40 });
        });

        fireEvent.pointerDown(screen.getByRole('button', { name: 'Move Goal b earlier' }), { button: 0, pointerType: 'mouse', pointerId: 1 });
        expect(items[1]).not.toHaveAttribute('data-dragging');

        fireEvent.pointerDown(within(items[1]).getByText('Goal b'), { button: 0, pointerType: 'mouse', pointerId: 1 });
        fireEvent.pointerMove(items[1], { clientY: 5, pointerId: 1 });
        fireEvent.pointerUp(items[1], { pointerId: 1 });

        expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Goal b');
    });

    it('reports the drafted order to the host while open', () => {
        const onSequencingChange = vi.fn();
        const goal = child('a');
        const { unmount } = render(
            <GoalSequenceSubView rootId="r" goal={goal} goalId="a" treeData={tree([goal, child('b')])} onBack={vi.fn()} onDone={vi.fn()} onSequencingChange={onSequencingChange} />,
        );

        expect(onSequencingChange).toHaveBeenLastCalledWith({ goalId: 'a', trackId: null, stepIds: ['a'] });
        fireEvent.click(screen.getByRole('button', { name: 'Add Goal b' }));
        expect(onSequencingChange).toHaveBeenLastCalledWith({ goalId: 'a', trackId: null, stepIds: ['a', 'b'] });
        unmount();
        expect(onSequencingChange).toHaveBeenLastCalledWith(null);
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
        expect(screen.getByRole('button', { name: 'Save sequence' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Move Goal c earlier' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove Goal a from the sequence' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save sequence' }));
        await waitFor(() => expect(mutations.setSteps).toHaveBeenCalledWith('t', ['c', 'b']));

        fireEvent.click(screen.getByRole('button', { name: 'Break entire sequence' }));
        await waitFor(() => expect(mutations.dissolveTrack).toHaveBeenCalledWith('t'));
    });

    it('explains when there is nothing to sequence with', () => {
        const goal = child('a');
        renderView(goal, [goal, child('b', { level_id: 'short' })]);
        expect(screen.getByText('No sibling goals at this level to sequence with.')).toBeInTheDocument();
    });
});
