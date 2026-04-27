import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import Notes from '../Notes';

const {
    createNote,
    navigate,
    useNotesPageQueryMock,
} = vi.hoisted(() => ({
    createNote: vi.fn(),
    navigate: vi.fn(),
    useNotesPageQueryMock: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useParams: () => ({ rootId: 'root-1' }),
        useNavigate: () => navigate,
    };
});

vi.mock('../../hooks/useNotesPageQuery', () => ({
    useNotesPageQuery: (...args) => useNotesPageQueryMock(...args),
}));

vi.mock('../../hooks/useActivityQueries', () => ({
    useActivities: () => ({ activities: [] }),
    useActivityGroups: () => ({ activityGroups: [] }),
}));

vi.mock('../../components/notes', () => ({
    NoteTimeline: () => <div>Timeline</div>,
    NoteComposer: ({ onSubmit }) => (
        <button onClick={() => onSubmit('Root note', null, null)} type="button">
            Submit mocked note
        </button>
    ),
}));

vi.mock('../../components/notes/NoteComposer', () => ({
    ComposeLinkPanel: () => <div>Compose links</div>,
}));

vi.mock('../../hooks/useGoalQueries', () => ({
    useFractalTree: () => ({ data: null }),
}));

vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#000',
        getGoalIcon: () => 'square',
        getGoalSecondaryColor: () => '#fff',
    }),
}));

vi.mock('../../components/common/GoalTreePicker', () => ({
    default: () => null,
}));

vi.mock('../../hooks/useIsMobile', () => ({
    default: () => false,
}));

vi.mock('../../components/layout/PageHeader', () => ({
    default: ({ title, actions }) => (
        <div>
            <h1>{title}</h1>
            <div>{actions}</div>
        </div>
    ),
}));

vi.mock('../../components/layout/PageHeader.module.css', () => ({
    default: {
        actionButton: 'actionButton',
        primaryActionButton: 'primaryActionButton',
        secondaryActionButton: 'secondaryActionButton',
    },
}));

describe('Notes page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useNotesPageQueryMock.mockReturnValue({
            notes: [],
            total: 0,
            hasMore: false,
            isLoading: false,
            isFetching: false,
            loadNextPage: vi.fn(),
            createNote,
            updateNote: vi.fn(),
            deleteNote: vi.fn(),
            pinNote: vi.fn(),
            unpinNote: vi.fn(),
        });
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn(() => null),
                setItem: vi.fn(),
            },
            configurable: true,
        });
    });

    it('creates a root-context note when no goal or activity is linked', async () => {
        createNote.mockResolvedValue({});

        render(<Notes />);

        await act(async () => {
            fireEvent.click(screen.getByText('+ Write Note'));
        });

        await waitFor(() => {
            expect(screen.getByText('Submit mocked note')).toBeInTheDocument();
        });

        await act(async () => {
            fireEvent.click(screen.getByText('Submit mocked note'));
        });

        await waitFor(() => {
            expect(createNote).toHaveBeenCalledWith({
                content: 'Root note',
                context_type: 'root',
                context_id: 'root-1',
                goal_id: undefined,
                activity_definition_id: undefined,
            });
        });
    });

    it('shows note type filters and passes selected note types to the notes query', async () => {
        render(<Notes />);

        expect(screen.getByRole('button', { name: 'Activity Set Notes' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Program Notes' })).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Program Notes' }));
        });

        const latestCall = useNotesPageQueryMock.mock.calls.at(-1);
        expect(latestCall[1]).toMatchObject({
            note_types: ['program_note'],
        });
    });
});
