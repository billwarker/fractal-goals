import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import GoalDeleteConfirmSubView from '../GoalDeleteConfirmSubView';

const { sequence } = vi.hoisted(() => ({ sequence: { data: null, enabled: null } }));
vi.mock('../../../hooks/useGoalSequenceQueries', () => ({
    useGoalSequence: (_rootId, _goalId, { enabled }) => {
        sequence.enabled = enabled;
        return { data: enabled ? sequence.data : undefined, isLoading: false };
    },
}));

describe('GoalDeleteConfirmSubView', () => {
    beforeEach(() => {
        sequence.data = null;
    });

    it('confirms a childless goal in one step', () => {
        const onConfirm = vi.fn();
        render(<GoalDeleteConfirmSubView rootId="r" goal={{ name: 'Leaf' }} goalId="g" onBack={vi.fn()} onConfirm={onConfirm} />);
        expect(screen.getByText('“Leaf” will be deleted.')).toBeInTheDocument();
        expect(sequence.enabled).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Delete Goal' }));
        expect(onConfirm).toHaveBeenCalledWith({});
    });

    it('needs "delete" typed when descendants go too', () => {
        const onConfirm = vi.fn();
        render(<GoalDeleteConfirmSubView rootId="r" goal={{ name: 'Branch' }} goalId="g" childCount={2} onBack={vi.fn()} onConfirm={onConfirm} />);
        const button = screen.getByRole('button', { name: 'Delete Goal' });
        expect(button).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Type delete to confirm'), { target: { value: 'delete' } });
        fireEvent.click(button);
        expect(onConfirm).toHaveBeenCalledWith({});
    });

    it('asks whether a sequence\'s next goal begins when deleting its active step', () => {
        sequence.data = { next_step: { id: 'n', name: 'Next up' } };
        const onConfirm = vi.fn();
        render(<GoalDeleteConfirmSubView rootId="r" goal={{ name: 'Step 1', sequence_track_id: 't' }} goalId="g" onBack={vi.fn()} onConfirm={onConfirm} />);

        const checkbox = screen.getByRole('checkbox', { name: /Begin next goal in sequence: Next up/ });
        expect(checkbox).toBeChecked();
        fireEvent.click(checkbox);
        fireEvent.click(screen.getByRole('button', { name: 'Delete Goal' }));
        expect(onConfirm).toHaveBeenCalledWith({ beginNext: false });
    });

    it('does not ask for a paused or completed step', () => {
        sequence.data = { next_step: { id: 'n', name: 'Next up' } };
        render(<GoalDeleteConfirmSubView rootId="r" goal={{ name: 'Later', sequence_track_id: 't', paused: true }} goalId="g" onBack={vi.fn()} onConfirm={vi.fn()} />);
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
});
