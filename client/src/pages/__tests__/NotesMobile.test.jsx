import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';

import Notes from '../Notes';

const navigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useParams: () => ({ rootId: 'root-1' }),
        useNavigate: () => navigate,
    };
});

vi.mock('../../hooks/useNotesPageQuery', () => ({
    useNotesPageQuery: () => ({
        notes: [],
        total: 10,
        hasMore: false,
        isLoading: false,
        isFetching: false,
        loadNextPage: vi.fn(),
        updateNote: vi.fn(),
        deleteNote: vi.fn(),
        pinNote: vi.fn(),
        unpinNote: vi.fn(),
    }),
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
    NoteTimeline: () => <div>Timeline</div>,
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
    default: () => true,
    getIsMobileViewport: () => true,
}));

describe('Notes mobile shell', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn(() => null),
                setItem: vi.fn(),
            },
            configurable: true,
        });
    });

    it('opens and closes mobile filters from a single secondary footer action', () => {
        render(<MemoryRouter><Notes /></MemoryRouter>);
        const footer = screen.getByRole('contentinfo', { name: 'Note filter controls' });
        expect(footer.parentElement).toBe(document.body);
        const button = within(footer).getByRole('button', { name: 'Show Filters' });
        expect(screen.getAllByRole('button', { name: 'Show Filters' })).toHaveLength(1);
        expect(button).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(button);
        expect(screen.getByText('Filters')).toBeInTheDocument();
        expect(document.querySelector('.mobile-sheet-enter')).toBeInTheDocument();
        expect(document.querySelector('.mobile-sheet-enter [data-sheet-handle]')).toBeInTheDocument();
        expect(document.querySelector('.mobile-sheet-backdrop-enter')).toBeInTheDocument();
        expect(button).toHaveAttribute('aria-expanded', 'true');
        // The same header as Sessions: Reset Filters and Hide.
        expect(screen.getByRole('button', { name: 'Reset Filters' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Hide filters panel' }));
        expect(screen.queryByText('Filters')).not.toBeInTheDocument();
        expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('offers no write action on mobile', () => {
        render(<MemoryRouter><Notes /></MemoryRouter>);
        expect(screen.queryByText(/Write Note/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Associator/)).not.toBeInTheDocument();
    });
});
