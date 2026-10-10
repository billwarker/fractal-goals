import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import Notes from '../Notes';

const navigate = vi.fn();
const createNote = vi.fn();

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
        createNote,
        updateNote: vi.fn(),
        deleteNote: vi.fn(),
        pinNote: vi.fn(),
        unpinNote: vi.fn(),
    }),
}));

vi.mock('../../hooks/useActivityQueries', () => ({
    useActivities: () => ({ activities: [] }),
    useActivityGroups: () => ({ activityGroups: [] }),
}));

vi.mock('../../components/notes', () => ({
    NoteTimeline: () => <div>Timeline</div>,
    NoteComposer: ({ onCancel }) => (
        <div>
            <div>Composer</div>
            <button type="button" onClick={onCancel}>Cancel composer</button>
        </div>
    ),
}));

vi.mock('../../components/notes/NoteComposer', () => ({
    ComposeLinkPanel: () => <div>Associator panel</div>,
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

describe('Notes mobile compose shell', () => {
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
        render(<Notes />);
        const footer = screen.getByRole('contentinfo', { name: 'Note filter controls' });
        expect(footer.parentElement).toBe(document.body);
        const button = within(footer).getByRole('button', { name: 'Show Filters' });
        expect(screen.getAllByRole('button', { name: 'Show Filters' })).toHaveLength(1);
        expect(button).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(button);
        expect(screen.getByText('Filters')).toBeInTheDocument();
        expect(document.querySelector('.mobile-sheet-enter')).toBeInTheDocument();
        expect(document.querySelector('.mobile-sheet-backdrop-enter')).toBeInTheDocument();
        expect(button).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Hide', exact: true }));
        expect(screen.queryByText('Filters')).not.toBeInTheDocument();
        expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('switches the mobile footer action to the associator toggle during compose mode', async () => {
        render(<Notes />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: '+ Write Note' }));
        });

        const footer = screen.getByRole('contentinfo', { name: 'Note filter controls' });
        expect(within(footer).getByRole('button', { name: 'Show Associator' })).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Show Associator' }));
        });

        expect(screen.getByText('Associator')).toBeInTheDocument();
        expect(screen.getByText('Associator panel')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Hide Associator' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Hide', exact: true }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel composer' }));
        expect(within(footer).getByRole('button', { name: 'Show Filters' })).toBeInTheDocument();
    });
});
