import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GoalReviewForm from '../GoalReviewForm';

const data = vi.hoisted(() => ({ heatmapDays: [], notes: [] }));
vi.mock('../../../contexts/TimezoneContext', () => ({ useTimezone: () => ({ timezone: 'UTC' }) }));
vi.mock('../../../hooks/useStorageConnections', () => ({ useStorageConnections: () => ({ providers: [], limits: null }) }));
vi.mock('../../../hooks/useGoalActivityHeatmap', () => ({ useGoalActivityHeatmap: () => ({ data: { days: data.heatmapDays } }) }));
vi.mock('../../../hooks/useGoalNotes', () => ({ useGoalNotes: () => ({ notes: data.notes }) }));

const goal = {
    id: 'g', name: 'Play in a band', description: 'Gig monthly', review: { last_review_on: '2026-07-19' },
    children: [{ id: 'c1', completed: true, completed_at: '2026-08-02T10:00:00Z' }, { id: 'c2', completed: false }],
};

describe('GoalReviewForm', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
        data.heatmapDays = [{ date: '2026-08-01', activities: 2 }, { date: '2026-07-01', activities: 1 }];
        data.notes = [
            { id: 'old', note_kind: 'goal_review', created_at: '2026-04-01T00:00:00Z', content: 'Older' },
            { id: 'last', note_kind: 'goal_review', created_at: '2026-07-19T00:00:00Z', review_data: { status: 'at_risk', went_well: 'Wrote two songs' } },
        ];
    });
    afterEach(() => vi.useRealTimers());

    it('shows what changed since the last review without any markdown', () => {
        render(<GoalReviewForm rootId="r" goal={goal} goalId="g" onSubmit={vi.fn()} />);
        const context = screen.getByRole('region', { name: 'Review context' });
        expect(context).toHaveTextContent('Since the last review (Jul 19)');
        expect(context).toHaveTextContent('Gig monthly');
        expect(context).toHaveTextContent('Active on 1 day');
        expect(context).toHaveTextContent('1 of 2 child goals completed');
        expect(context).toHaveTextContent('Wrote two songs');
        expect(screen.queryByText(/##|\*\*/)).not.toBeInTheDocument();
        screen.getAllByRole('textbox').forEach((field) => expect(field).toHaveValue(''));
    });

    it('saves the status and answers as review data', async () => {
        const onSubmit = vi.fn().mockResolvedValue(true);
        render(<GoalReviewForm rootId="r" goal={goal} goalId="g" onSubmit={onSubmit} />);
        const save = screen.getByRole('button', { name: 'Save review' });
        expect(save).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'On track' }));
        expect(screen.getByRole('button', { name: 'On track' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.change(screen.getByLabelText('What went well?'), { target: { value: 'Played a gig' } });
        fireEvent.click(save);

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(
            { schema: 1, status: 'on_track', went_well: 'Played a gig', change: '', next_focus: '' }, [],
        ));
    });

    it('hands Save to the host footer and saves from there', async () => {
        const onSubmit = vi.fn().mockResolvedValue(true);
        const registerFooterAction = vi.fn();
        const { unmount } = render(
            <GoalReviewForm rootId="r" goal={goal} goalId="g" onSubmit={onSubmit} onCancel={vi.fn()} registerFooterAction={registerFooterAction} />,
        );
        expect(screen.queryByRole('button', { name: 'Save review' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
        expect(registerFooterAction).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'Save review', disabled: true }));

        fireEvent.change(screen.getByLabelText('What went well?'), { target: { value: 'Played a gig' } });
        const action = registerFooterAction.mock.lastCall[0];
        expect(action.disabled).toBe(false);
        await act(async () => action.onClick());
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ went_well: 'Played a gig' }), []);

        unmount();
        expect(registerFooterAction).toHaveBeenLastCalledWith(null);
    });

    it('edits an existing review: answers filled in, that review not shown as the last one', async () => {
        const onSubmit = vi.fn().mockResolvedValue(true);
        render(<GoalReviewForm rootId="r" goal={goal} goalId="g" onSubmit={onSubmit} editingNote={data.notes[1]} />);
        expect(screen.getByRole('button', { name: 'At risk' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByLabelText('What went well?')).toHaveValue('Wrote two songs');
        expect(screen.queryByRole('button', { name: 'Attach pictures, video or audio' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('Last review'));
        expect(screen.getByText('Older')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('What would you change?'), { target: { value: 'Rehearse' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(
            { schema: 1, status: 'at_risk', went_well: 'Wrote two songs', change: 'Rehearse', next_focus: '' }, [],
        ));
    });

    it('keeps the answers when saving fails', async () => {
        render(<GoalReviewForm rootId="r" goal={goal} goalId="g" onSubmit={vi.fn().mockResolvedValue(false)} />);
        fireEvent.change(screen.getByLabelText('What would you change?'), { target: { value: 'Rehearse more' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save review' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Your answers are still here');
        expect(screen.getByLabelText('What would you change?')).toHaveValue('Rehearse more');
    });
});
