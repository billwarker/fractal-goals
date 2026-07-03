import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FractalGoals from '../FractalGoals';

const createGoalMock = vi.fn();
const updateGoalMock = vi.fn();
const deleteGoalMock = vi.fn();
const toggleGoalCompletionMock = vi.fn();
const setActiveRootIdMock = vi.fn();
const startFadeOutMock = vi.hoisted(() => vi.fn());
const isMobileMock = vi.hoisted(() => ({ value: false }));
const surfaceMocks = vi.hoisted(() => ({
    createSurface: vi.fn(),
    updateSurface: vi.fn(),
    setDefaultSurface: vi.fn(),
    deleteSurface: vi.fn(),
}));
const localStorageStore = new Map();

let fractalTree;

vi.mock('../../components/FractalView', async () => {
    const ReactModule = await vi.importActual('react');
    return {
        default: ReactModule.forwardRef((props, ref) => {
            ReactModule.useImperativeHandle(ref, () => ({
                startFadeOut: startFadeOutMock,
            }), []);

            return (
                <div
                    data-testid="fractal-view"
                    data-zoom-target={props.zoomTargetNodeId || ''}
                    data-selected-node={props.selectedNodeId || ''}
                    data-hide-inactive-goals={String(Boolean(props.viewSettings?.hideInactiveGoals))}
                    data-hide-completed-goals={String(Boolean(props.viewSettings?.hideCompletedGoals))}
                    data-scope-transition-key={String(props.scopeTransitionKey || 0)}
                    data-layout-mode={props.layoutMode || 'tree'}
                />
            );
        }),
    };
});

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

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'user-1', username: 'will' } }),
}));

vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#38bdf8',
        getGoalSecondaryColor: () => '#0f766e',
        getGoalIcon: () => 'circle',
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

vi.mock('../../hooks/usePageSurfaceQueries', () => ({
    usePageSurfaces: () => ({
        surfaces: [],
        createSurface: surfaceMocks.createSurface,
        updateSurface: surfaceMocks.updateSurface,
        setDefaultSurface: surfaceMocks.setDefaultSurface,
        deleteSurface: surfaceMocks.deleteSurface,
    }),
}));

vi.mock('../../hooks/useIsMobile', () => ({
    default: () => isMobileMock.value,
    getIsMobileViewport: () => isMobileMock.value,
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

function expandOptionsPane() {
    fireEvent.click(screen.getByRole('button', { name: 'Expand tree view options' }));
}

describe('FractalGoals type-to-zoom search', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isMobileMock.value = false;
        localStorageStore.clear();
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key) => localStorageStore.get(key) ?? null),
            setItem: vi.fn((key, value) => {
                localStorageStore.set(key, String(value));
            }),
            removeItem: vi.fn((key) => {
                localStorageStore.delete(key);
            }),
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
        surfaceMocks.createSurface.mockResolvedValue({ id: 'surface-1' });
        surfaceMocks.updateSurface.mockResolvedValue({ id: 'surface-1' });
        surfaceMocks.setDefaultSurface.mockResolvedValue({ id: 'surface-1' });
        surfaceMocks.deleteSurface.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('starts with the goals view options pane minimized', () => {
        renderFractalGoals();

        expect(screen.getByRole('button', { name: 'Expand tree view options' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Fade inactive branches')).not.toBeInTheDocument();

        expandOptionsPane();

        expect(screen.getByLabelText('Fade inactive branches')).toBeInTheDocument();
    });

    it('persists goals view options for the current user and root across remounts', async () => {
        const view = renderFractalGoals();
        expandOptionsPane();

        fireEvent.click(screen.getByLabelText('Fade inactive branches'));
        fireEvent.click(screen.getByRole('button', { name: 'Hierarchy' }));

        await waitFor(() => {
            const stored = JSON.parse(localStorageStore.get('flowtree-view-settings:user-1:root'));
            expect(stored).toMatchObject({
                goalsViewMode: 'hierarchy',
                viewSettings: {
                    fadeInactiveBranches: true,
                },
            });
        });

        view.unmount();
        renderFractalGoals();
        expandOptionsPane();

        await waitFor(() => {
            expect(screen.getByLabelText('Fade inactive branches')).toBeChecked();
            expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-layout-mode', 'hierarchy');
        });
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

    it('locks a multi-match search with Enter and cycles all matched goals', async () => {
        renderFractalGoals();

        fireEvent.keyDown(window, { key: 'p' });
        fireEvent.keyDown(window, { key: 'Enter' });

        await waitFor(() => {
            expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-zoom-target', 'zebra');
        });
        expect(screen.getByText('Locked 1/3')).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'ArrowDown' });

        await waitFor(() => {
            expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-zoom-target', 'scales-1');
        });
        expect(screen.getByText('Locked 2/3')).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'ArrowUp' });

        await waitFor(() => {
            expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-zoom-target', 'zebra');
        });
        expect(screen.getByText('Locked 1/3')).toBeInTheDocument();
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

    it('keeps a locked search open for 10 seconds of inactivity', async () => {
        vi.useFakeTimers();
        renderFractalGoals();

        fireEvent.keyDown(window, { key: 'p' });
        fireEvent.keyDown(window, { key: 'Enter' });

        expect(screen.getByText('Locked 1/3')).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(9900);
        });

        expect(screen.getByText('Find goal')).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(200);
        });

        expect(screen.queryByText('Find goal')).not.toBeInTheDocument();
    });

    it('resets locked search idle when cycling results', async () => {
        vi.useFakeTimers();
        renderFractalGoals();

        fireEvent.keyDown(window, { key: 'p' });
        fireEvent.keyDown(window, { key: 'Enter' });

        act(() => {
            vi.advanceTimersByTime(9000);
        });

        fireEvent.keyDown(window, { key: 'ArrowDown' });

        act(() => {
            vi.advanceTimersByTime(1500);
        });

        expect(screen.getByText('Find goal')).toBeInTheDocument();
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

    it('offers a tree option to hide inactive goals', () => {
        vi.useFakeTimers();
        renderFractalGoals();
        expandOptionsPane();

        const hideInactiveToggle = screen.getByLabelText('Hide inactive goals');
        expect(hideInactiveToggle).not.toBeChecked();

        fireEvent.click(hideInactiveToggle);

        expect(startFadeOutMock).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-hide-inactive-goals', 'false');
        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-scope-transition-key', '0');

        act(() => {
            vi.advanceTimersByTime(170);
        });

        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-hide-inactive-goals', 'true');
        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-scope-transition-key', '1');
    });

    it('transitions before applying the hide completed goals tree option', () => {
        vi.useFakeTimers();
        renderFractalGoals();
        expandOptionsPane();

        fireEvent.click(screen.getByLabelText('Hide completed goals'));

        expect(startFadeOutMock).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-hide-completed-goals', 'false');
        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-scope-transition-key', '0');

        act(() => {
            vi.advanceTimersByTime(170);
        });

        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-hide-completed-goals', 'true');
        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-scope-transition-key', '1');
    });

    it('defaults to the FlowTree hierarchy layout on mobile and swaps to tree when toggled', () => {
        isMobileMock.value = true;
        renderFractalGoals();

        expect(screen.getByRole('button', { name: 'Hierarchy' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Tree' })).toBeInTheDocument();
        expect(screen.getByText('Hierarchy View')).toBeInTheDocument();
        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-layout-mode', 'hierarchy');

        fireEvent.click(screen.getByRole('button', { name: 'Tree' }));

        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-layout-mode', 'tree');
    });

    it('allows desktop users to switch from tree to hierarchy view', () => {
        renderFractalGoals();

        expect(screen.getByTestId('fractal-view')).toBeInTheDocument();
        expect(screen.getByText('Tree View')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Hierarchy' }));

        expect(screen.getByText('Hierarchy View')).toBeInTheDocument();
        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-layout-mode', 'hierarchy');
    });

    it('lets desktop users switch the configured surface target to mobile and back', async () => {
        renderFractalGoals();
        expandOptionsPane();

        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-layout-mode', 'tree');

        fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
        fireEvent.click(screen.getByRole('button', { name: 'Mobile' }));

        await waitFor(() => {
            expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-layout-mode', 'hierarchy');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Desktop' }));

        await waitFor(() => {
            expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-layout-mode', 'tree');
        });
    });

    it('saves a named goals surface layout with desktop and mobile configs', async () => {
        renderFractalGoals();
        expandOptionsPane();

        fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save as...' }));
        fireEvent.change(screen.getByLabelText('Surface name'), {
            target: { value: 'Practice layout' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save copy' }));

        await waitFor(() => {
            expect(surfaceMocks.createSurface).toHaveBeenCalledTimes(1);
        });
        expect(surfaceMocks.createSurface).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Practice layout',
            desktop_config: expect.objectContaining({
                version: 1,
                view_configs: expect.objectContaining({
                    overview: expect.any(Object),
                    scoped: expect.any(Object),
                }),
            }),
            mobile_config: expect.objectContaining({
                detail_panel: 'fullscreen',
                view_configs: expect.objectContaining({
                    overview: expect.any(Object),
                    scoped: expect.any(Object),
                }),
            }),
        }));
    });
});
