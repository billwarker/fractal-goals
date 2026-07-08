import React from 'react';
import { fireEvent, screen } from '@testing-library/react';

import { renderWithProviders } from '../../../test/test-utils';
import GoalNotesView from '../GoalNotesView';

const { useGoalNotesMock, noteTimelineProps } = vi.hoisted(() => ({
    useGoalNotesMock: vi.fn(),
    noteTimelineProps: [],
}));

vi.mock('../../../hooks/useGoalNotes', () => ({
    useGoalNotes: (...args) => useGoalNotesMock(...args),
}));

vi.mock('../../notes', () => ({
    NoteComposer: () => <div data-testid="note-composer" />,
    NoteTimeline: (props) => {
        noteTimelineProps.push(props);
        return <div data-testid="note-timeline">{props.emptyMessage}</div>;
    },
}));

describe('GoalNotesView', () => {
    beforeEach(() => {
        useGoalNotesMock.mockReset();
        noteTimelineProps.splice(0, noteTimelineProps.length);
        useGoalNotesMock.mockReturnValue({
            notes: [],
            isLoading: false,
            createNote: vi.fn(),
            updateNote: vi.fn(),
            deleteNote: vi.fn(),
            pinNote: vi.fn(),
            unpinNote: vi.fn(),
        });
    });

    it('exposes goal, activity instance, and children-data filters to the goal notes query', () => {
        renderWithProviders(
            <GoalNotesView rootId="root-1" goalId="goal-1" hideComposer />,
            {
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
                withTimezone: false,
            }
        );

        expect(screen.getByLabelText('Goal Notes')).toBeChecked();
        expect(screen.getByLabelText('Activity Instance Notes')).toBeChecked();
        expect(screen.getByLabelText('Include Children Data')).not.toBeChecked();
        expect(screen.queryByText('Include descendant goal notes')).not.toBeInTheDocument();
        expect(useGoalNotesMock).toHaveBeenLastCalledWith('root-1', 'goal-1', {
            includeDescendants: false,
            includeGoalNotes: true,
            includeActivityInstanceNotes: true,
        });

        fireEvent.click(screen.getByLabelText('Goal Notes'));
        expect(useGoalNotesMock).toHaveBeenLastCalledWith('root-1', 'goal-1', {
            includeDescendants: false,
            includeGoalNotes: false,
            includeActivityInstanceNotes: true,
        });

        fireEvent.click(screen.getByLabelText('Activity Instance Notes'));
        expect(useGoalNotesMock).toHaveBeenLastCalledWith('root-1', 'goal-1', {
            includeDescendants: false,
            includeGoalNotes: false,
            includeActivityInstanceNotes: false,
        });

        fireEvent.click(screen.getByLabelText('Include Children Data'));
        expect(useGoalNotesMock).toHaveBeenLastCalledWith('root-1', 'goal-1', {
            includeDescendants: true,
            includeGoalNotes: false,
            includeActivityInstanceNotes: false,
        });
    });
});
