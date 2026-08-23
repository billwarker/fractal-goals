import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

import FractalGoals from '../FractalGoals';

const startFadeOut = vi.hoisted(() => vi.fn());
const storage = new Map();
const programs = [
    {
        id: 'active', name: 'Technique Cycle', color: '#ef476f',
        start_date: '2020-01-01', end_date: '2099-12-31', goal_ids: ['scales'], blocks: [],
    },
    {
        id: 'future', name: 'Future Cycle', color: '#3a86ff',
        start_date: '2100-01-01', end_date: '2100-12-31', goal_ids: ['outside'], blocks: [],
    },
];

vi.mock('../../components/FractalView', async () => {
    const ReactModule = await vi.importActual('react');
    return {
        default: ReactModule.forwardRef((props, ref) => {
            ReactModule.useImperativeHandle(ref, () => ({ startFadeOut }), []);
            return (
                <div
                    data-testid="fractal-view"
                    data-allowed-goals={props.allowedGoalIds ? Array.from(props.allowedGoalIds).join('|') : ''}
                    data-scoped-program={props.scopedProgramName || ''}
                />
            );
        }),
    };
});
vi.mock('../../components/modals/DeleteConfirmModal', () => ({ default: () => null }));
vi.mock('../../components/modals/AlertModal', () => ({ default: () => null }));
vi.mock('../../components/atoms/Checkbox', () => ({
    default: ({ label, checked, onChange }) => <label>{label}<input type="checkbox" checked={checked} onChange={onChange} /></label>,
}));
vi.mock('../../contexts/GoalsContext', () => ({
    useGoals: () => ({
        createGoal: vi.fn(), updateGoal: vi.fn(), deleteGoal: vi.fn(),
        toggleGoalCompletion: vi.fn(), setActiveRootId: vi.fn(),
    }),
}));
vi.mock('../../contexts/DebugContext', () => ({ useDebug: () => ({ debugMode: false }) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#38bdf8', getGoalSecondaryColor: () => '#0f766e', getGoalIcon: () => 'circle',
    }),
}));
vi.mock('../../hooks/useGoalQueries', () => ({
    useFractalTree: () => ({
        data: {
            id: 'root', name: 'Root', type: 'UltimateGoal', children: [
                { id: 'scales', name: 'Scales', type: 'LongTermGoal', children: [
                    { id: 'speed', name: 'Speed', type: 'MidTermGoal', children: [] },
                ] },
                { id: 'outside', name: 'Outside', type: 'LongTermGoal', children: [] },
            ],
        },
        isLoading: false,
    }),
}));
vi.mock('../../hooks/useActivityQueries', () => ({
    useActivities: () => ({ activities: [], isLoading: false }),
    useActivityGroups: () => ({ activityGroups: [], isLoading: false }),
}));
vi.mock('../../hooks/useSessionQueries', () => ({
    useFlowTreeEvidence: () => ({ data: { goal_ids: [] }, isLoading: false }),
    useFlowtreeSessionMetrics: () => ({ data: null }),
}));
vi.mock('../../hooks/useProgramQueries', () => ({ usePrograms: () => ({ programs, isLoading: false }) }));
vi.mock('../../hooks/usePageSurfaceQueries', () => ({
    usePageSurfaces: () => ({
        surfaces: [], createSurface: vi.fn(), updateSurface: vi.fn(),
        setDefaultSurface: vi.fn(), deleteSurface: vi.fn(),
    }),
}));
vi.mock('../../hooks/useFeatureFlags', () => ({
    FEATURE_FLAGS: { goalSurfaceConfiguration: 'goal_surface_configuration' },
    useFeatureFlags: () => ({ flags: { goal_surface_configuration: false } }),
    isFeatureEnabled: (flags, key) => flags?.[key] === true,
}));
vi.mock('../../hooks/useIsMobile', () => ({ default: () => false, getIsMobileViewport: () => false }));
vi.mock('../../utils/lazyWithRetry', () => ({ lazyWithRetry: () => () => null }));

describe('FractalGoals active-program scope', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        startFadeOut.mockClear();
        storage.clear();
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key) => storage.get(key) ?? null),
            setItem: vi.fn((key, value) => storage.set(key, String(value))),
            removeItem: vi.fn((key) => storage.delete(key)),
        });
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('offers only active programs, scopes full lineage, and persists the selected program', () => {
        render(
            <MemoryRouter initialEntries={['/root/goals']}>
                <Routes><Route path="/:rootId/goals" element={<FractalGoals />} /></Routes>
            </MemoryRouter>
        );
        fireEvent.click(screen.getByRole('button', { name: 'Expand tree view options' }));

        expect(screen.queryByLabelText('Scope to Future Cycle')).not.toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Scope to Technique Cycle'));
        expect(startFadeOut).toHaveBeenCalledTimes(1);

        act(() => vi.advanceTimersByTime(170));

        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-allowed-goals', 'root|scales|speed');
        expect(screen.getByTestId('fractal-view')).toHaveAttribute('data-scoped-program', 'Technique Cycle');
        expect(screen.getByTitle('Goal tree scoped to Technique Cycle')).toHaveTextContent('Technique Cycle');
        expect(JSON.parse(storage.get('flowtree-view-settings:user-1:root')).scopedProgramId).toBe('active');
    });
});
