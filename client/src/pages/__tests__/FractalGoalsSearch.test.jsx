import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FractalGoals from '../FractalGoals';

const createGoalMock = vi.fn();
const updateGoalMock = vi.fn();
const deleteGoalMock = vi.fn();
const toggleGoalCompletionMock = vi.fn();
const setActiveRootIdMock = vi.fn();

let fractalTree;

vi.mock('../../components/FractalView', () => ({
    default: (props) => (
        <div
            data-testid="fractal-view"
            data-zoom-target={props.zoomTargetNodeId || ''}
            data-selected-node={props.selectedNodeId || ''}
            data-hide-inactive-goals={String(Boolean(props.viewSettings?.hideInactiveGoals))}
        />
    ),
}));

vi.mock('../../components/Sidebar', () => ({
    default: () => <div data-testid="sidebar" />,
}));

vi.mock('../../components/ErrorBoundary', () => ({
    default: ({ children }) => <>{children}</>,
}));

vi.mock('../../components/modals/DeleteConfirmModal', () => ({
    default: () => null,
}));

vi.mock('../../components/modals/AlertModal', () => ({
    default: () => null,
}));

vi.mock('../../components/atoms/Checkbox', () => ({
    default: ({ label, checked, onChange }) => (
        <label>
            {label}
            <input type="checkbox" checked={checked} onChange={onChange} />
        </label>
    ),
}));

vi.mock('../../contexts/GoalsContext', () => ({
    useGoals: () => ({
        createGoal: createGoalMock,
        updateGoal: updateGoalMock,
        deleteGoal: deleteGoalMock,
        toggleGoalCompletion: toggleGoalCompletionMock,
        setActiveRootId: setActiveRootIdMock,
    }),
}));

vi.mock('../../contexts/DebugContext', () => ({
    useDebug: () => ({ debugMode: false }),
}));

vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#38bdf8',
    }),
}));

vi.mock('../../hooks/useGoalQueries', () => ({
    useFractalTree: () => ({ data: fractalTree, isLoading: false }),
}));

vi.mock('../../hooks/useActivityQueries', () => ({
    useActivities: () => ({ activities: [], isLoading: false }),
    useActivityGroups: () => ({ activityGroups: [], isLoading: false }),
}));

vi.mock('../../hooks/useSessionQueries', () => ({
    useFlowTreeEvidence: () => ({ data: { goal_ids: [] }, isLoading: false }),
    useFlowtreeSessionMetrics: () => ({ data: null }),
}));

vi.mock('../../hooks/useProgramQueries', () => ({
    usePrograms: () => ({ programs: [] }),
}));

vi.mock('../../hooks/useIsMobile', () => ({
    default: () => false,
}));

vi.mock('../../utils/lazyWithRetry', () => ({
    lazyWithRetry: () => () => null,
}));

function renderFractalGoals() {
    return render(
        <MemoryRouter initialEntries={['/root/goals']}>
            <Routes>
                <Route path="/:rootId/goals" element={<FractalGoals />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('FractalGoals type-to-zoom search', () => {
    beforeEach(() => {
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        });

        fractalTree = {
            id: 'root',
            name: 'Root Goal',
            type: 'UltimateGoal',
            children: [
                {
                    id: 'zebra',
                    name: 'Zebra Practice',
                    type: 'LongTermGoal',
                    children: [],
                },
                {
                    id: 'scales-1',
                    name: 'Practice Scales',
                    type: 'LongTermGoal',
                    children: [],
                },
                {
                    id: 'scales-2',
                    name: 'Practice-Scales',
                    type: 'LongTermGoal',
                    children: [],
                },
            ],
        };
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('opens the palette and zooms when typing creates a unique match', async () => {
        renderFractalGoals();

        fireEvent.keyDown(window, { key: 'z' });

        expect(screen.getByText('Find goal')).toBeInTheDocument();
        expect(screen.getByText('z')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-zoom-target', 'zebra');
        });

        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-selected-node', '');
    });

    it('cycles exact duplicate-name matches with arrow keys', async () => {
        renderFractalGoals();

        fireEvent.keyDown(window, { key: 'p' });
        fireEvent.keyDown(window, { key: 'ArrowDown' });

        await waitFor(() => {
            expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-zoom-target', 'scales-2');
        });
        expect(screen.getByText('Duplicate 2/2')).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'ArrowUp' });

        await waitFor(() => {
            expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-zoom-target', 'scales-1');
        });
    });

    it('clears the palette on Escape', async () => {
        renderFractalGoals();

        fireEvent.keyDown(window, { key: 'z' });
        expect(screen.getByText('Find goal')).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByText('Find goal')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-zoom-target', '');
    });

    it('keeps raw punctuation and spacing visible, supports backspace, and clears after idle', async () => {
        vi.useFakeTimers();
        renderFractalGoals();

        fireEvent.keyDown(window, { key: 'p' });
        fireEvent.keyDown(window, { key: 'Spacebar', code: 'Space' });
        fireEvent.keyDown(window, { key: '-' });
        fireEvent.keyDown(window, { key: ' ', code: 'Space' });
        fireEvent.keyDown(window, { key: 's' });

        expect(document.querySelector('.type-to-zoom-query')?.textContent).toBe('p\u00a0-\u00a0s');

        fireEvent.keyDown(window, { key: 'Backspace' });

        expect(document.querySelector('.type-to-zoom-query')?.textContent).toBe('p\u00a0-\u00a0');

        act(() => {
            vi.advanceTimersByTime(2100);
        });

        expect(screen.queryByText('Find goal')).not.toBeInTheDocument();
    });

    it('continues capturing spaces after the query already has a unique match', async () => {
        renderFractalGoals();

        fireEvent.keyDown(window, { key: 'z' });

        await waitFor(() => {
            expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-zoom-target', 'zebra');
        });

        fireEvent.keyDown(window, { key: 'e' });
        fireEvent.keyDown(window, { key: 'Space', code: 'Space' });
        fireEvent.keyDown(window, { key: 'p' });
        fireEvent.keyDown(window, { key: ' ', code: 'Space' });
        fireEvent.keyDown(window, { key: 'x' });

        expect(document.querySelector('.type-to-zoom-query')?.textContent).toBe('ze\u00a0p\u00a0x');
        expect(screen.getByText('0 matches')).toBeInTheDocument();
    });

    it('closes the palette when backspacing the final character', async () => {
        renderFractalGoals();

        fireEvent.keyDown(window, { key: 'z' });
        expect(screen.getByText('Find goal')).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Backspace' });

        await waitFor(() => {
            expect(screen.queryByText('Find goal')).not.toBeInTheDocument();
        });
    });

    it('does not capture typing from an active input', () => {
        renderFractalGoals();
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();

        fireEvent.keyDown(window, { key: 'z' });

        expect(screen.queryByText('Find goal')).not.toBeInTheDocument();
        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-zoom-target', '');

        document.body.removeChild(input);
    });

    it('offers a graph option to hide inactive goals', () => {
        renderFractalGoals();

        const hideInactiveToggle = screen.getByLabelText('Hide inactive goals');
        expect(hideInactiveToggle).not.toBeChecked();

        fireEvent.click(hideInactiveToggle);

        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-hide-inactive-goals', 'true');
    });
});
