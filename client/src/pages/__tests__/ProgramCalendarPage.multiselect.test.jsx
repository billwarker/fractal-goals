import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import ProgramCalendarPage from '../ProgramCalendarPage';

const { mutateStatuses } = vi.hoisted(() => ({
    mutateStatuses: vi.fn().mockResolvedValue({}),
}));

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
    useProgramDayRange: () => ({ data: { days: [
        { date: '2026-09-02', scheduled: true },
        { date: '2026-09-08', scheduled: true },
    ] } }),
    useUpdateProgramDayStatuses: () => ({ mutateAsync: mutateStatuses, isPending: false }),
    useSetProgramDaySessionCredit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
const openPeriodEditor = vi.fn();
vi.mock('../../hooks/useCalendarPeriods', () => ({
    useCalendarPeriods: () => ({ data: [] }),
    useCalendarPeriodEditor: () => ({
        openCreate: openPeriodEditor,
        openEdit: vi.fn(),
        removePeriod: vi.fn(),
        modalProps: { isOpen: false, period: null, onClose: vi.fn(), onSubmit: vi.fn(), onDelete: vi.fn() },
    }),
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
        onCalendarBackgroundClick,
        selectedRange,
        selectionModeButtonRef,
        statusActions,
    }) => (
        <div>
            <button type="button" ref={selectionModeButtonRef} onClick={() => setBlockCreationMode(!blockCreationMode)}>Toggle multi-select</button>
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
            <button type="button" onClick={() => onDateClick({ dateStr: '2026-09-02' })}>Toggle status day</button>
            <button type="button" onClick={() => onDateClick({ dateStr: '2026-09-08' })}>Toggle September 8 status day</button>
            <button type="button" onClick={() => onCalendarBackgroundClick({ target: { closest: () => null } })}>
                Calendar drag background click
            </button>
            {statusActions}
        </div>
    ),
}));
vi.mock('../../components/programs/ResponsiveProgramSidePane', () => ({
    default: ({ scope, selectedRange, selectionLabel, programMetrics }) => (
        <aside>
            <output data-testid="pane-scope">{scope}</output>
            <output data-testid="pane-selection-label">{selectionLabel || 'none'}</output>
            <output data-testid="pane-range">
                {selectedRange ? `${selectedRange.startDate}/${selectedRange.endDate}` : 'none'}
            </output>
            <output data-testid="metrics-range">
                {programMetrics?.requestedRange
                    ? (programMetrics.requestedRange.dates?.join(',')
                        || `${programMetrics.requestedRange.start}/${programMetrics.requestedRange.end}`)
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
        expect(screen.getByTestId('calendar-range')).toHaveTextContent('none');

        fireEvent.click(screen.getByRole('button', { name: 'Select scheduled event on September 8' }));

        expect(screen.getByTestId('calendar-range')).toHaveTextContent('none');
        expect(screen.getByTestId('pane-range')).toHaveTextContent('2026-09-02/2026-09-08');
        expect(screen.getByTestId('metrics-range')).toHaveTextContent('2026-09-02,2026-09-08');
        expect(screen.getByTestId('pane-selection-label')).toHaveTextContent('2 selected days');
        expect(screen.getAllByText('2 selected days').length).toBeGreaterThan(1);

        fireEvent.click(screen.getByRole('button', { name: 'Toggle September 8 status day' }));
        expect(screen.getByTestId('metrics-range')).toHaveTextContent('2026-09-02');
        expect(screen.getByTestId('pane-selection-label')).toHaveTextContent('Sep 2, 2026');
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
        expect(screen.getByTestId('calendar-range')).toHaveTextContent('none');
        expect(screen.getByTestId('pane-range')).toHaveTextContent('2026-09-01/2026-09-03');
        expect(screen.getByTestId('metrics-range')).toHaveTextContent('2026-09-02');
        expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('bulk marks arbitrary scheduled dates complete through one mutation', async () => {
        render(
            <MemoryRouter initialEntries={['/root-1/programs']}>
                <Routes>
                    <Route path="/:rootId/programs" element={<ProgramCalendarPage />} />
                </Routes>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Toggle multi-select' }));
        fireEvent.click(screen.getByRole('button', { name: 'Toggle status day' }));
        expect(screen.getByText('1 selected')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Complete' }));

        await waitFor(() => expect(mutateStatuses).toHaveBeenCalledWith({
            dates: ['2026-09-02'],
            status: 'complete',
            timezone: 'UTC',
            acknowledge_completed_evidence: false,
        }));
    });

    it('bulk marks noncontiguous days as rest from the same multi-day mode', async () => {
        render(
            <MemoryRouter initialEntries={['/root-1/programs']}>
                <Routes>
                    <Route path="/:rootId/programs" element={<ProgramCalendarPage />} />
                </Routes>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Toggle multi-select' }));
        fireEvent.click(screen.getByRole('button', { name: 'Toggle status day' }));
        fireEvent.click(screen.getByRole('button', { name: 'Toggle September 8 status day' }));
        expect(screen.getByText('2 selected')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Rest' }));

        await waitFor(() => expect(mutateStatuses).toHaveBeenCalledWith({
            dates: ['2026-09-02', '2026-09-08'],
            status: 'rest',
            timezone: 'UTC',
            acknowledge_completed_evidence: false,
        }));
    });

    it('restores focus to the selection toggle after Escape', () => {
        render(
            <MemoryRouter initialEntries={['/root-1/programs']}>
                <Routes>
                    <Route path="/:rootId/programs" element={<ProgramCalendarPage />} />
                </Routes>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Toggle multi-select' }));
        fireEvent.click(screen.getByRole('button', { name: 'Toggle status day' }));
        fireEvent.keyDown(window, { key: 'Escape' });

        expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Toggle multi-select' })).toHaveFocus();
    });

    it('keeps multi-day selection active after the background click emitted by a drag', () => {
        render(
            <MemoryRouter initialEntries={['/root-1/programs']}>
                <Routes>
                    <Route path="/:rootId/programs" element={<ProgramCalendarPage />} />
                </Routes>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Toggle multi-select' }));
        fireEvent.click(screen.getByRole('button', { name: 'Toggle status day' }));
        fireEvent.click(screen.getByRole('button', { name: 'Calendar drag background click' }));

        expect(screen.getByText('1 selected')).toBeInTheDocument();
        expect(screen.getByTestId('metrics-range')).toHaveTextContent('2026-09-02');
    });
});
