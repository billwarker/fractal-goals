import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import ProgramCalendarPage from '../ProgramCalendarPage';

const program = {
    id: 'program-1',
    name: 'Strong Finish',
    start_date: '2026-09-01',
    end_date: '2026-12-31',
    blocks: [],
};

vi.mock('../../contexts/GoalsContext', () => ({
    useGoals: () => ({ setActiveRootId: vi.fn() }),
}));
vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#3b82f6',
        getGoalTextColor: () => '#fff',
        getGoalSecondaryColor: () => '#172554',
        getGoalIcon: () => 'circle',
    }),
}));
vi.mock('../../contexts/TimezoneContext', () => ({
    useTimezone: () => ({ timezone: 'UTC' }),
}));
vi.mock('../../contexts/OnboardingContext', () => ({
    useOptionalOnboarding: () => null,
}));
vi.mock('../../hooks/useIsMobile', () => ({
    default: () => false,
    getIsMobileViewport: () => false,
}));
vi.mock('../../hooks/useProgramsCalendarData', () => ({
    useProgramsCalendarData: () => ({
        programs: [program],
        goals: [],
        calendarEvents: [],
        blockLabels: [],
        loading: false,
        refetchPrograms: vi.fn(),
    }),
}));
vi.mock('../../hooks/useProgramData', () => ({
    useProgramData: () => ({
        program,
        loading: false,
        goals: [],
        activities: [],
        activityGroups: [],
        sessions: [],
        treeData: null,
        refreshData: vi.fn(),
        refreshers: {},
        getGoalDetails: () => null,
    }),
}));
vi.mock('../../hooks/useProgramGoalSets', () => ({
    useProgramGoalSets: () => ({
        attachedGoalIds: [],
        attachableBlockGoals: [],
        hierarchyGoalSeeds: [],
    }),
}));
vi.mock('../../hooks/useProgramDetailViewModel', () => ({
    useProgramDetailViewModel: () => ({
        sortedBlocks: [],
        attachBlock: null,
        blockGoalsByBlockId: {},
    }),
}));
vi.mock('../../hooks/useProgramDetailMutations', () => ({
    useProgramDetailMutations: () => ({
        saveBlock: vi.fn(),
        deleteBlock: vi.fn(),
        saveDay: vi.fn(),
        copyDay: vi.fn(),
        deleteDay: vi.fn(),
        scheduleDay: vi.fn(),
        saveAttachedGoal: vi.fn(),
        updateGoal: vi.fn(),
        toggleGoalCompletion: vi.fn(),
        deleteGoal: vi.fn(),
        createGoal: vi.fn(),
    }),
}));
vi.mock('../../hooks/useProgramMetrics', () => ({
    useProgramMetrics: (_rootId, _programId, _timezone, range) => ({
        data: { requestedRange: range || null },
        isLoading: false,
        error: null,
    }),
}));
vi.mock('../../hooks/useProgramDayReadModel', () => ({
    useProgramDayDetail: () => ({ data: null }),
    useProgramDayRange: () => ({ data: { days: [] } }),
}));

vi.mock('../../components/layout/PageHeader', () => ({
    default: ({ title, subtitle, actions }) => <header>{title}{subtitle}{actions}</header>,
}));
vi.mock('../../components/common/ViewToggleTabs', () => ({
    default: () => null,
}));
vi.mock('../../components/layout/HeaderButton', () => ({
    default: ({ children, ...props }) => <button type="button" {...props}>{children}</button>,
}));
vi.mock('../../components/programs/ProgramCalendarView', () => ({
    default: ({
        blockCreationMode,
        setBlockCreationMode,
        onDateClick,
        onDateSelect,
        onEventClick,
        selectedRange,
    }) => (
        <div>
            <button type="button" onClick={() => setBlockCreationMode(!blockCreationMode)}>Toggle multi-select</button>
            <button
                type="button"
                onClick={() => {
                    onDateClick({ dateStr: '2026-09-02' });
                    onDateSelect({
                        startStr: '2026-09-02',
                        endStr: '2026-09-03',
                        view: { calendar: { unselect: vi.fn() } },
                    });
                }}
            >
                Select September 2
            </button>
            <button
                type="button"
                onClick={() => onEventClick({
                    event: {
                        startStr: '2026-09-08',
                        extendedProps: { type: 'program_day', programId: 'program-1' },
                    },
                })}
            >
                Select scheduled event on September 8
            </button>
            <button
                type="button"
                onClick={() => onDateSelect({
                    startStr: '2026-09-01',
                    endStr: '2026-09-04',
                    view: { calendar: { unselect: vi.fn() } },
                })}
            >
                Drag September 1 through 3
            </button>
            <output data-testid="calendar-range">
                {selectedRange ? `${selectedRange.startDate}/${selectedRange.endDate}` : 'none'}
            </output>
        </div>
    ),
}));
vi.mock('../../components/programs/ResponsiveProgramSidePane', () => ({
    default: ({ scope, selectedRange, programMetrics }) => (
        <aside>
            <output data-testid="pane-scope">{scope}</output>
            <output data-testid="pane-range">
                {selectedRange ? `${selectedRange.startDate}/${selectedRange.endDate}` : 'none'}
            </output>
            <output data-testid="metrics-range">
                {programMetrics?.requestedRange
                    ? `${programMetrics.requestedRange.start}/${programMetrics.requestedRange.end}`
                    : 'whole-program'}
            </output>
        </aside>
    ),
}));

describe('ProgramCalendarPage multi-day selection', () => {
    it('survives the click/select callback pair and extends through event-filled cells', () => {
        render(
            <MemoryRouter initialEntries={['/root-1/programs']}>
                <Routes>
                    <Route path="/:rootId/programs" element={<ProgramCalendarPage />} />
                </Routes>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Toggle multi-select' }));
        fireEvent.click(screen.getByRole('button', { name: 'Select September 2' }));

        expect(screen.getByTestId('pane-scope')).toHaveTextContent('range');
        expect(screen.getByTestId('calendar-range')).toHaveTextContent('2026-09-02/2026-09-02');

        fireEvent.click(screen.getByRole('button', { name: 'Select scheduled event on September 8' }));

        expect(screen.getByTestId('calendar-range')).toHaveTextContent('2026-09-02/2026-09-08');
        expect(screen.getByTestId('pane-range')).toHaveTextContent('2026-09-02/2026-09-08');
        expect(screen.getByTestId('metrics-range')).toHaveTextContent('2026-09-02/2026-09-08');
    });

    it('scopes the pane and metrics to a September 1–3 drag selection', () => {
        render(
            <MemoryRouter initialEntries={['/root-1/programs']}>
                <Routes>
                    <Route path="/:rootId/programs" element={<ProgramCalendarPage />} />
                </Routes>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Toggle multi-select' }));
        fireEvent.click(screen.getByRole('button', { name: 'Drag September 1 through 3' }));

        expect(screen.getByTestId('pane-scope')).toHaveTextContent('range');
        expect(screen.getByTestId('calendar-range')).toHaveTextContent('2026-09-01/2026-09-03');
        expect(screen.getByTestId('pane-range')).toHaveTextContent('2026-09-01/2026-09-03');
        expect(screen.getByTestId('metrics-range')).toHaveTextContent('2026-09-01/2026-09-03');
    });
});
