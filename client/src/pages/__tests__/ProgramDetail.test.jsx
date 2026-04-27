import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const lazyImportLog = vi.hoisted(() => []);
const controllerState = vi.hoisted(() => ({
    showEditBuilder: false,
    showBlockModal: false,
    showDayModal: false,
    showAttachModal: false,
    showDayViewModal: true,
    showGoalModal: false,
}));

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useParams: () => ({ rootId: 'root-1', programId: 'program-1' }),
        useNavigate: () => vi.fn(),
    };
});

vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#3A86FF',
        getGoalTextColor: () => '#ffffff',
    }),
}));

vi.mock('../../contexts/TimezoneContext', () => ({
    useTimezone: () => ({ timezone: 'UTC' }),
}));

vi.mock('../../hooks/useIsMobile', () => ({
    default: () => false,
}));

vi.mock('../../components/atoms/Linkify', () => ({
    default: ({ children }) => <>{children}</>,
}));

vi.mock('../../components/programs/ProgramSidebar', () => ({
    default: () => <div>Sidebar</div>,
}));

vi.mock('../../components/programs/ProgramCalendarView', () => ({
    default: () => <div>Calendar View</div>,
}));

vi.mock('../../components/programs/ProgramBlockView', () => ({
    default: () => <div>Block View</div>,
}));

vi.mock('../../components/ConfirmationModal', () => ({
    default: () => null,
}));

vi.mock('../../hooks/useProgramData', () => ({
    useProgramData: () => ({
        program: {
            id: 'program-1',
            name: 'Program',
            start_date: '2026-03-01',
            end_date: '2026-03-31',
            description: '',
        },
        loading: false,
        goals: [],
        activities: [],
        activityGroups: [],
        sessions: [],
        treeData: [],
        refreshData: vi.fn(),
        refreshers: {},
        getGoalDetails: vi.fn(),
    }),
}));

vi.mock('../../hooks/useProgramGoalSets', () => ({
    useProgramGoalSets: () => ({
        attachedGoalIds: new Set(),
        attachedGoals: [],
        attachableBlockGoals: [],
        hierarchyGoalSeeds: [],
    }),
}));

vi.mock('../../hooks/useProgramDetailController', () => ({
    useProgramDetailController: () => ({
        showEditBuilder: controllerState.showEditBuilder,
        setShowEditBuilder: vi.fn(),
        viewMode: 'calendar',
        setViewMode: vi.fn(),
        isSidebarOpen: true,
        setIsSidebarOpen: vi.fn(),
        showBlockModal: controllerState.showBlockModal,
        blockModalData: null,
        showDayModal: controllerState.showDayModal,
        selectedBlockId: null,
        dayModalInitialData: null,
        showAttachModal: controllerState.showAttachModal,
        attachBlockId: null,
        blockCreationMode: false,
        setBlockCreationMode: vi.fn(),
        showDayViewModal: controllerState.showDayViewModal,
        selectedDate: '2026-03-09',
        unscheduleConfirmOpen: false,
        itemToUnschedule: null,
        showGoalModal: controllerState.showGoalModal,
        selectedGoal: null,
        modalMode: 'view',
        selectedParent: null,
        openGoalModal: vi.fn(),
        closeGoalModal: vi.fn(),
        handleDateSelect: vi.fn(),
        handleDateClick: vi.fn(),
        handleAddBlockClick: vi.fn(),
        handleEditBlockClick: vi.fn(),
        closeBlockModal: vi.fn(),
        handleBlockSaveSuccess: vi.fn(),
        handleAddDayClick: vi.fn(),
        handleCreateDayForDate: vi.fn(),
        handleEditDay: vi.fn(),
        closeDayModal: vi.fn(),
        handleDaySaveSuccess: vi.fn(),
        handleAttachGoalClick: vi.fn(),
        closeAttachModal: vi.fn(),
        handleAttachGoalSaveSuccess: vi.fn(),
        closeDayViewModal: vi.fn(),
        handleScheduleDaySuccess: vi.fn(),
        handleUnscheduleDay: vi.fn(),
        closeUnscheduleConfirm: vi.fn(),
        handleUnscheduleSuccess: vi.fn(),
        handleEventClick: vi.fn(),
        handleAddChildGoal: vi.fn(),
    }),
}));

vi.mock('../../hooks/useProgramDetailViewModel', () => ({
    useProgramDetailViewModel: () => ({
        sortedBlocks: [],
        calendarEvents: [],
        programMetrics: {},
        activeBlock: null,
        blockMetrics: {},
        attachBlock: null,
        blockGoalsByBlockId: new Map(),
    }),
}));

vi.mock('../../hooks/useProgramDetailMutations', () => ({
    useProgramDetailMutations: () => ({
        saveProgram: vi.fn(),
        saveBlock: vi.fn(),
        deleteBlock: vi.fn(),
        saveDay: vi.fn(),
        copyDay: vi.fn(),
        deleteDay: vi.fn(),
        unscheduleDay: vi.fn(),
        scheduleDay: vi.fn(),
        saveAttachedGoal: vi.fn(),
        setGoalDeadline: vi.fn(),
        updateGoal: vi.fn(),
        toggleGoalCompletion: vi.fn(),
        deleteGoal: vi.fn(),
        createGoal: vi.fn(),
    }),
}));

vi.mock('../../components/modals/ProgramBuilder', () => {
    lazyImportLog.push('ProgramBuilder');
    return { default: () => <div>Program Builder Modal</div> };
});

vi.mock('../../components/modals/ProgramBlockModal', () => {
    lazyImportLog.push('ProgramBlockModal');
    return { default: () => <div>Program Block Modal</div> };
});

vi.mock('../../components/modals/ProgramDayModal', () => {
    lazyImportLog.push('ProgramDayModal');
    return { default: () => <div>Program Day Modal</div> };
});

vi.mock('../../components/modals/AttachGoalModal', () => {
    lazyImportLog.push('AttachGoalModal');
    return { default: () => <div>Attach Goal Modal</div> };
});

vi.mock('../../components/modals/DayViewModal', () => {
    lazyImportLog.push('DayViewModal');
    return { default: () => <div>Day View Modal</div> };
});

vi.mock('../../components/GoalDetailModal', () => {
    lazyImportLog.push('GoalDetailModal');
    return { default: () => <div>Goal Detail Modal</div> };
});

describe('ProgramDetail', () => {
    beforeEach(() => {
        lazyImportLog.length = 0;
        Object.assign(controllerState, {
            showEditBuilder: false,
            showBlockModal: false,
            showDayModal: false,
            showAttachModal: false,
            showDayViewModal: true,
            showGoalModal: false,
        });
    });

    it('loads only the active lazy modal for day view state', async () => {
        vi.resetModules();
        const { default: ProgramDetail } = await import('../ProgramDetail');

        render(<ProgramDetail />);

        expect(screen.getByText('Block View')).toBeInTheDocument();
        await screen.findByText('Day View Modal');

        await waitFor(() => {
            expect(lazyImportLog).toEqual(['DayViewModal']);
        });
    });

    it('loads only the block modal when block editing is active', async () => {
        Object.assign(controllerState, {
            showBlockModal: true,
            showDayViewModal: false,
        });

        vi.resetModules();
        const { default: ProgramDetail } = await import('../ProgramDetail');

        render(<ProgramDetail />);

        expect(screen.getByText('Block View')).toBeInTheDocument();
        await screen.findByText('Program Block Modal');

        await waitFor(() => {
            expect(lazyImportLog).toEqual(['ProgramBlockModal']);
        });
    });
});
