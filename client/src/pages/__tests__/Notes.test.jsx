import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

import Notes from '../Notes';

const {
    navigate,
    noteTimelineMock,
    useNotesPageQueryMock,
} = vi.hoisted(() => ({
    navigate: vi.fn(),
    noteTimelineMock: vi.fn(),
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
    useNotesHeatmap: () => ({ data: { days: [], total: 0, max_count: 0 }, isLoading: false }),
}));

vi.mock('../../hooks/useNoteFilters', () => ({
    useNoteFilters: () => ({ savedFilters: [], isLoading: false, createFilter: vi.fn(), updateFilter: vi.fn(), deleteFilter: vi.fn() }),
}));

vi.mock('../../contexts/TimezoneContext', () => ({ useTimezone: () => ({ timezone: 'UTC' }) }));

vi.mock('../../hooks/useActivityQueries', () => ({
    useActivities: () => ({ activities: [] }),
    useActivityGroups: () => ({ activityGroups: [] }),
}));

vi.mock('../../components/notes', () => ({
    NoteTimeline: (props) => {
        noteTimelineMock(props);
        return <div>Timeline</div>;
    },
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
    getIsMobileViewport: () => false,
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

    it('has no write action and edits notes inline', () => {
        render(<MemoryRouter><Notes /></MemoryRouter>);

        expect(screen.queryByText(/Write Note/)).not.toBeInTheDocument();
        const timelineProps = noteTimelineMock.mock.calls.at(-1)[0];
        expect(timelineProps.onEditRequest).toBeUndefined();
        expect(timelineProps.onEdit).toBe(useNotesPageQueryMock.mock.results.at(-1).value.updateNote);
    });

    it('offers four compact categories and passes the selection to the notes query', async () => {
        render(<MemoryRouter><Notes /></MemoryRouter>);

        const categories = screen.getByRole('group', { name: 'Categories' });
        expect(Array.from(categories.querySelectorAll('button')).map((button) => button.textContent))
            .toEqual(['General', 'Goals', 'Sessions', 'Programs']);
        expect(screen.queryByRole('button', { name: 'Activity Set Notes' })).not.toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Programs' }));
        });

        expect(useNotesPageQueryMock.mock.calls.at(-1)[1]).toMatchObject({ categories: ['programs'] });
        expect(screen.getByRole('button', { name: 'Programs' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('renders note type labels as metadata text on the timeline', () => {
        render(<MemoryRouter><Notes /></MemoryRouter>);

        expect(noteTimelineMock).toHaveBeenCalledWith(expect.objectContaining({
            noteTypeVariant: 'metadata',
            showContext: true,
        }));
    });
});
