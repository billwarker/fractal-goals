import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { GoalCompletionNoteComposer, GoalCompletionNotePrompt } from '../GoalCompletionNoteSection';

const api = vi.hoisted(() => ({ updateGoal: vi.fn(), createNote: vi.fn() }));
vi.mock('../../../utils/api', () => ({ fractalApi: { updateGoal: api.updateGoal } }));
vi.mock('../../../utils/api/fractalNotesApi', () => ({ fractalNotesApi: { createNote: api.createNote } }));
vi.mock('../../../utils/goalTreeCache', () => ({ refreshGoalReadModels: vi.fn() }));
vi.mock('../../../hooks/useAttachmentDraft', () => ({
    useAttachmentDraft: () => ({ payload: () => [], isBusy: false, busyReason: '', dropProps: {} }),
}));

vi.mock('../../notes/AttachableField', () => ({ default: ({ children }) => children }));

const wrap = (ui) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
    vi.clearAllMocks();
    api.updateGoal.mockResolvedValue({ data: {} });
    api.createNote.mockResolvedValue({ data: {} });
});

describe('GoalCompletionNotePrompt', () => {
    it('offers to write the note, or dismisses the prompt for this completion', async () => {
        const onWrite = vi.fn();
        wrap(<GoalCompletionNotePrompt rootId="root" goalId="g" onWrite={onWrite} />);

        expect(screen.getByRole('region', { name: 'Add a completion note' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Write note' }));
        expect(onWrite).toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        await waitFor(() => expect(api.updateGoal).toHaveBeenCalledWith('root', 'g', { completion_note_dismissed: true }));
    });
});

describe('GoalCompletionNoteComposer', () => {
    it('saves a completion note from the host footer, then returns', async () => {
        let footer = null;
        const onDone = vi.fn();
        wrap(<GoalCompletionNoteComposer rootId="root" goalId="g" onDone={onDone} registerFooterAction={(action) => { footer = action; }} />);

        expect(footer).toEqual(expect.objectContaining({ label: 'Save note', disabled: true }));
        fireEvent.change(screen.getByLabelText('Goal Completion Note'), { target: { value: 'Held it for 6s, clean.' } });
        await waitFor(() => expect(footer.disabled).toBe(false));
        footer.onClick();

        await waitFor(() => expect(onDone).toHaveBeenCalled());
        expect(api.createNote).toHaveBeenCalledWith('root', expect.objectContaining({
            content: 'Held it for 6s, clean.', goal_id: 'g', note_kind: 'goal_completion',
        }));
    });
});
