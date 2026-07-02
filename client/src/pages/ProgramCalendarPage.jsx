import React, { Suspense, useEffect, useMemo, useReducer, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import DeleteProgramModal from '../components/modals/DeleteProgramModal';
import ProgramBuilder from '../components/modals/ProgramBuilder';
import ProgramBlockView from '../components/programs/ProgramBlockView';
import ProgramCalendarView from '../components/programs/ProgramCalendarView';
import ProgramSidePane from '../components/programs/ProgramSidePane';
import ConfirmationModal from '../components/ConfirmationModal';
import Modal from '../components/atoms/Modal';
import PageHeader from '../components/layout/PageHeader';
import HeaderButton from '../components/layout/HeaderButton';
import { useGoals } from '../contexts/GoalsContext';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useTimezone } from '../contexts/TimezoneContext';
import { useProgramData } from '../hooks/useProgramData';
import { useProgramDetailController } from '../hooks/useProgramDetailController';
import { useProgramDetailMutations } from '../hooks/useProgramDetailMutations';
import { useProgramDetailViewModel } from '../hooks/useProgramDetailViewModel';
import { useProgramGoalSets } from '../hooks/useProgramGoalSets';
import { useNotesPageQuery } from '../hooks/useNotesPageQuery';
import { useProgramsCalendarData } from '../hooks/useProgramsCalendarData';
import useIsMobile, { getIsMobileViewport } from '../hooks/useIsMobile';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { formatLiteralDate, getISOYMDInTimezone, subtractDaysToDateString } from '../utils/dateUtils';
import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { createProgramCalendarContext, programCalendarContextReducer } from '../utils/programCalendarContext';
import { getProgramColor } from '../utils/programViewModel';
import styles from './ProgramCalendarPage.module.css';

const ProgramBlockModal = lazyWithRetry(() => import('../components/modals/ProgramBlockModal'), 'components/modals/ProgramBlockModal');
const ProgramDayModal = lazyWithRetry(() => import('../components/modals/ProgramDayModal'), 'components/modals/ProgramDayModal');
const AttachGoalModal = lazyWithRetry(() => import('../components/modals/AttachGoalModal'), 'components/modals/AttachGoalModal');
const DayViewModal = lazyWithRetry(() => import('../components/modals/DayViewModal'), 'components/modals/DayViewModal');
const GoalDetailModal = lazyWithRetry(() => import('../components/ConnectedGoalDetailModal'), 'components/ConnectedGoalDetailModal');

function getDatePart(dateValue) {
    if (!dateValue) return null;
    return String(dateValue).split('T')[0];
}

function dateInProgram(dateStr, program) {
    const start = getDatePart(program.start_date);
    const end = getDatePart(program.end_date);
    return Boolean(start && end && dateStr >= start && dateStr <= end);
}

function getProgramStatus(program, today) {
    const start = getDatePart(program.start_date);
    const end = getDatePart(program.end_date);

    if (start && today < start) return 'upcoming';
    if (end && today > end) return 'completed';
    return 'active';
}

function getProgramBucket(program, today) {
    const start = getDatePart(program.start_date);
    const end = getDatePart(program.end_date);

    if (start && today < start) return 'upcoming';
    if (end && today > end) return 'completed';
    return 'active';
}

function dateRangesOverlap(startA, endA, startB, endB) {
    return Boolean(startA && endA && startB && endB && startA <= endB && endA >= startB);
}

function getStatusBadgeClass(status) {
    if (status === 'active') return 'statusBadgeActive';
    if (status === 'upcoming') return 'statusBadgeUpcoming';
    if (status === 'completed') return 'statusBadgeCompleted';
    return 'statusBadgeInactive';
}

function getStatusLabel(status) {
    if (status === 'completed') return 'Completed';
    if (status === 'upcoming') return 'Upcoming';
    if (status === 'active') return 'Active';
    return 'Inactive';
}

function getDayOffset(startDate, nextStartDate) {
    const source = new Date(`${getDatePart(startDate)}T00:00:00`);
    const target = new Date(`${getDatePart(nextStartDate)}T00:00:00`);
    if (Number.isNaN(source.getTime()) || Number.isNaN(target.getTime())) return 0;
    return Math.round((target.getTime() - source.getTime()) / 86400000);
}

function shiftDatePart(dateValue, dayOffset) {
    const datePart = getDatePart(dateValue);
    if (!datePart) return null;
    const shifted = new Date(`${datePart}T00:00:00`);
    if (Number.isNaN(shifted.getTime())) return null;
    shifted.setDate(shifted.getDate() + dayOffset);
    return shifted.toISOString().slice(0, 10);
}

function ProgramCalendarPage() {
    const { rootId, programId } = useParams();
    const location = useLocation();
    const isMobile = useIsMobile();
    const { setActiveRootId } = useGoals();
    const { getGoalColor, getGoalTextColor } = useGoalLevels();
    const { timezone } = useTimezone();
    const todayInTimezone = useMemo(
        () => getISOYMDInTimezone(new Date(), timezone || 'UTC'),
        [timezone],
    );
    const [calendarContext, dispatchCalendarContext] = useReducer(
        programCalendarContextReducer,
        todayInTimezone,
        createProgramCalendarContext,
    );
    const {
        contextProgramId,
        contextDate,
        selectedRange: selectedCalendarRange,
        pendingBlockSelection,
    } = calendarContext;
    const [viewMode, setViewMode] = useState(programId ? 'blocks' : 'calendar');
    const [isSidePaneVisible, setIsSidePaneVisible] = useState(() => {
        return !getIsMobileViewport();
    });
    const [sidePaneView, setSidePaneView] = useState('details');
    const [isProgramOptionsOpen, setIsProgramOptionsOpen] = useState(false);
    const [programOptionsView, setProgramOptionsView] = useState('actions');
    const [programPickerQuery, setProgramPickerQuery] = useState('');
    const [programPickerFilter, setProgramPickerFilter] = useState('all');
    const [builderState, setBuilderState] = useState({ open: false, mode: 'create', startDate: '', duplicateSource: null });
    const [programToDelete, setProgramToDelete] = useState(null);
    const [deleteSessionCount, setDeleteSessionCount] = useState(0);
    const {
        programs,
        goals,
        calendarEvents,
        blockLabels,
        loading,
        refetchPrograms,
    } = useProgramsCalendarData(rootId, { getGoalColor, getGoalTextColor, timezone });

    const activeProgramId = useMemo(
        () => programs.find((program) => dateInProgram(todayInTimezone, program))?.id || null,
        [programs, todayInTimezone],
    );
    const selectedProgramId = contextProgramId !== undefined ? contextProgramId : (programId || activeProgramId);
    const selectedProgram = useMemo(
        () => programs.find((program) => program.id === selectedProgramId) || null,
        [programs, selectedProgramId],
    );

    const {
        program: detailedProgram,
        loading: detailLoading,
        goals: detailGoals,
        activities,
        activityGroups,
        sessions,
        treeData,
        refreshData,
        refreshers,
        getGoalDetails,
    } = useProgramData(rootId, selectedProgramId);

    const displayProgram = detailedProgram || selectedProgram;
    const displayGoals = detailGoals?.length ? detailGoals : goals;
    const programNoteFilters = useMemo(() => ({
        context_types: ['program'],
        context_id: displayProgram?.id || '__no-program__',
    }), [displayProgram?.id]);
    const programNotesQuery = useNotesPageQuery(rootId, programNoteFilters);
    const programNotes = programNotesQuery.notes;

    const {
        attachedGoalIds,
        attachableBlockGoals,
        hierarchyGoalSeeds,
    } = useProgramGoalSets({
        program: displayProgram,
        goals: displayGoals,
        getGoalDetails,
    });

    const {
        showBlockModal,
        blockModalData,
        showDayModal,
        selectedBlockId,
        dayModalInitialData,
        showAttachModal,
        attachBlockId,
        showDayViewModal,
        selectedDate,
        unscheduleConfirmOpen,
        itemToUnschedule,
        showGoalModal,
        selectedGoal,
        modalMode,
        selectedParent,
        blockCreationMode,
        setBlockCreationMode,
        openGoalModal,
        closeGoalModal,
        handleDateSelect,
        handleDateClick: handleProgramDateClick,
        handleAddBlockClick,
        handleEditBlockClick,
        closeBlockModal,
        handleBlockSaveSuccess,
        handleAddDayClick,
        handleCreateDayForDate,
        handleEditDay,
        closeDayModal,
        handleDaySaveSuccess,
        handleAttachGoalClick,
        closeAttachModal,
        handleAttachGoalSaveSuccess,
        closeDayViewModal,
        handleScheduleDaySuccess,
        handleUnscheduleDay,
        closeUnscheduleConfirm,
        handleUnscheduleSuccess,
        handleAddChildGoal,
    } = useProgramDetailController({ goals: displayGoals });

    useEffect(() => {
        if (!rootId || location.pathname.startsWith(`/${rootId}/programs`)) return;

        closeGoalModal();
    }, [closeGoalModal, location.pathname, rootId]);

    const {
        sortedBlocks,
        programMetrics,
        activeBlock,
        blockMetrics,
        attachBlock,
        blockGoalsByBlockId,
    } = useProgramDetailViewModel({
        program: displayProgram,
        goals: displayGoals,
        sessions,
        timezone,
        getGoalColor,
        getGoalTextColor,
        getGoalDetails,
        attachBlockId,
        attachedGoalIds,
        hierarchyGoalSeeds,
    });

    const {
        saveBlock,
        deleteBlock,
        saveDay,
        copyDay,
        deleteDay,
        unscheduleDay,
        scheduleDay,
        saveAttachedGoal,
        saveDayGoal,
        updateGoal,
        toggleGoalCompletion,
        deleteGoal,
        createGoal,
    } = useProgramDetailMutations({
        rootId,
        program: displayProgram,
        refreshData,
        refreshers,
        timezone,
        sessions,
        selectedBlockId,
        dayModalInitialData,
        attachBlockId,
        selectedDate,
        itemToUnschedule,
        onBlockSaved: handleProgramBlockSaveSuccess,
        onDaySaved: handleDaySaveSuccess,
        onAttachGoalSaved: handleAttachGoalSaveSuccess,
        onScheduleDaySaved: handleScheduleDaySuccess,
        onUnscheduleFinished: handleUnscheduleSuccess,
        onGoalEditorClosed: closeGoalModal,
    });

    const displayProgramStatus = displayProgram ? getProgramStatus(displayProgram, todayInTimezone) : null;
    const displayProgramColor = displayProgram ? getProgramColor(displayProgram) : null;
    const groupedPrograms = useMemo(() => {
        const normalizedQuery = programPickerQuery.trim().toLowerCase();
        const groups = {
            active: [],
            upcoming: [],
            completed: [],
        };

        programs.forEach((program) => {
            const bucket = getProgramBucket(program, todayInTimezone);
            const matchesQuery = !normalizedQuery
                || program.name.toLowerCase().includes(normalizedQuery)
                || `${formatLiteralDate(program.start_date)} ${formatLiteralDate(program.end_date)}`.toLowerCase().includes(normalizedQuery);
            const matchesFilter = programPickerFilter === 'all' || programPickerFilter === bucket;

            if (matchesQuery && matchesFilter) {
                groups[bucket].push(program);
            }
        });

        groups.active.sort((a, b) => (getDatePart(a.start_date) || '').localeCompare(getDatePart(b.start_date) || ''));
        groups.upcoming.sort((a, b) => (getDatePart(a.start_date) || '').localeCompare(getDatePart(b.start_date) || ''));
        groups.completed.sort((a, b) => (getDatePart(b.end_date) || '').localeCompare(getDatePart(a.end_date) || ''));

        return groups;
    }, [programPickerFilter, programPickerQuery, programs, todayInTimezone]);
    const filteredProgramCount = groupedPrograms.active.length + groupedPrograms.upcoming.length + groupedPrograms.completed.length;

    const selectedRangeText = selectedCalendarRange
        ? `${formatLiteralDate(selectedCalendarRange.startDate)} - ${formatLiteralDate(selectedCalendarRange.endDate)}`
        : null;
    const selectedDateText = formatLiteralDate(contextDate);
    const contextBlock = displayProgram
        ? sortedBlocks.find((block) => dateInProgram(contextDate, block))
        : null;
    const contextBlockColor = contextBlock?.color || 'var(--color-brand-primary)';
    const pageTitleParts = [
        displayProgram?.name ? {
            key: 'program',
            label: displayProgram.name,
            style: displayProgramColor ? { color: displayProgramColor } : undefined,
        } : null,
        contextBlock?.name ? {
            key: 'block',
            label: contextBlock.name,
            style: { color: contextBlockColor },
        } : null,
        { key: 'date', label: selectedRangeText || selectedDateText },
    ].filter(Boolean);
    const pageTitle = (
        <span className={styles.headerTitleSegments}>
            {pageTitleParts.map((part, index) => (
                <React.Fragment key={part.key}>
                    {index > 0 ? <span className={styles.headerTitleSeparator}>•</span> : null}
                    <span className={styles.headerTitleSegment} style={part.style}>
                        {part.label}
                    </span>
                </React.Fragment>
            ))}
        </span>
    );
    const pageSubtitle = displayProgram
        ? (
            <span className={styles.headerMetaRow}>
                <span>{formatLiteralDate(displayProgram.start_date)} - {formatLiteralDate(displayProgram.end_date)}</span>
                {displayProgramStatus ? (
                    <span className={`${styles.statusBadge} ${styles[getStatusBadgeClass(displayProgramStatus)]}`}>
                        {getStatusLabel(displayProgramStatus)}
                    </span>
                ) : null}
                {blockMetrics ? (
                    <span
                        className={styles.blockBadge}
                        style={{ borderColor: blockMetrics.color, color: blockMetrics.color, background: `color-mix(in srgb, ${blockMetrics.color} 14%, transparent)` }}
                    >
                        {blockMetrics.name}
                    </span>
                ) : null}
                {selectedRangeText ? <span>Selected {selectedRangeText}</span> : null}
            </span>
        )
        : (selectedRangeText ? 'No program scheduled for these days.' : 'No program scheduled for this day.');
    const duplicateInitialData = useMemo(() => {
        if (builderState.mode !== 'duplicate' || !builderState.duplicateSource) return null;
        return {
            ...builderState.duplicateSource,
            id: `${builderState.duplicateSource.id}-duplicate`,
            name: `${builderState.duplicateSource.name} Copy`,
            start_date: '',
            end_date: '',
        };
    }, [builderState.duplicateSource, builderState.mode]);

    useEffect(() => {
        if (rootId) {
            setActiveRootId(rootId);
        }
        return () => setActiveRootId(null);
    }, [rootId, setActiveRootId]);

    useEffect(() => {
        if (isMobile) {
            setIsSidePaneVisible(false);
        }
    }, [isMobile, rootId]);

    const openCreateProgram = (startDate = '') => {
        setBuilderState({ open: true, mode: 'create', startDate, duplicateSource: null });
    };

    const closeBuilder = () => {
        setBuilderState({ open: false, mode: 'create', startDate: '', duplicateSource: null });
    };

    const updateCalendarRangeContext = ({ startDate, endDate = startDate, program = null }) => {
        const programId = program?.id || null;
        const isRangeSelection = startDate !== endDate;
        const canAddBlockFromSelection = Boolean(
            isRangeSelection
            && program
            && getProgramStatus(program, todayInTimezone) !== 'completed'
            && dateInProgram(startDate, program)
            && dateInProgram(endDate, program)
            && !(program.blocks || []).some((block) =>
                dateRangesOverlap(startDate, endDate, getDatePart(block.start_date), getDatePart(block.end_date))
            )
        );

        if (isRangeSelection) {
            dispatchCalendarContext({
                type: 'focus_range',
                startDate,
                endDate,
                programId,
                pendingBlockSelection: canAddBlockFromSelection ? { startDate, endDate } : null,
            });
        } else {
            dispatchCalendarContext({
                type: 'focus_day',
                date: startDate,
                programId,
            });
        }
        closeDayViewModal();
    };

    const handleDateClick = (info) => {
        const clickedDate = info.dateStr;
        const program = programs.find((candidate) => dateInProgram(clickedDate, candidate));
        const clickedProgramId = program?.id || null;
        const currentProgramId = selectedProgramId || null;

        if (blockCreationMode) {
            updateCalendarRangeContext({ startDate: clickedDate, program });
            return;
        }

        if (clickedProgramId !== currentProgramId || clickedDate !== contextDate || selectedCalendarRange) {
            updateCalendarRangeContext({ startDate: clickedDate, program });
            return;
        }

        dispatchCalendarContext({
            type: 'focus_day',
            date: clickedDate,
            programId: clickedProgramId,
        });
        setViewMode('calendar');
        handleProgramDateClick(info);
    };

    const handleEventClick = (info) => {
        const eventType = info.event.extendedProps?.type;

        if (eventType === 'block_background' || eventType === 'program_background') {
            return;
        }

        if (eventType === 'goal') {
            const goalId = info.event.extendedProps?.goalId || info.event.extendedProps?.id;
            const goal = displayGoals.find((entry) => entry.id === goalId);
            if (goal) {
                openGoalModal(goal);
            }
            return;
        }

        const programId = info.event.extendedProps?.programId;
        if (!programId) {
            return;
        }

        const clickedDate = info.event.startStr ? getDatePart(info.event.startStr) : contextDate;
        const isSameContext = programId === selectedProgramId;

        if (!isSameContext) {
            updateCalendarRangeContext({
                startDate: clickedDate,
                program: programs.find((candidate) => candidate.id === programId) || null,
            });
            return;
        }

        if (clickedDate !== contextDate || selectedCalendarRange) {
            updateCalendarRangeContext({
                startDate: clickedDate,
                program: programs.find((candidate) => candidate.id === programId) || null,
            });
            return;
        }

        setViewMode('calendar');
        handleProgramDateClick({ dateStr: clickedDate });
    };

    const handleDateSelectForContext = (info) => {
        const clickedDate = info.startStr;
        const selectionEndDate = subtractDaysToDateString(info.endStr, 1);
        const program = programs.find((candidate) => dateInProgram(clickedDate, candidate));

        if (blockCreationMode) {
            info.view.calendar.unselect();
            updateCalendarRangeContext({ startDate: clickedDate, endDate: selectionEndDate, program });
            return;
        }

        handleDateSelect(info);
    };

    const handleCalendarGoalDeadline = async (goalId, deadline) => {
        await updateGoal(goalId, { deadline });
        notify.success('Deadline updated');
    };

    const resetCalendarContextToToday = () => {
        const program = programs.find((candidate) => dateInProgram(todayInTimezone, candidate));
        dispatchCalendarContext({
            type: 'reset_today',
            date: todayInTimezone,
            programId: program?.id || null,
        });
        setBlockCreationMode(false);
        closeDayViewModal();
    };

    const handleCalendarBackgroundClick = (event) => {
        const interactiveTarget = event.target.closest(
            '.fc-daygrid-day, .fc-event, .fc-button, button, a, input, select, textarea'
        );

        if (interactiveTarget) {
            return;
        }

        resetCalendarContextToToday();
    };

    const handleBlockLabelClick = ({ startDate, endDate, programId: blockProgramId }) => {
        const program = programs.find((candidate) => candidate.id === blockProgramId)
            || (displayProgram?.id === blockProgramId ? displayProgram : null);

        updateCalendarRangeContext({
            startDate,
            endDate,
            program,
        });
    };

    const handleAddSelectedBlock = () => {
        if (!pendingBlockSelection) return;
        handleAddBlockClick(pendingBlockSelection);
    };

    const setBlockCreationModeForCalendar = (nextValue) => {
        setBlockCreationMode(nextValue);
        dispatchCalendarContext({ type: 'clear_pending_block_selection' });
    };

    function handleProgramBlockSaveSuccess() {
        dispatchCalendarContext({ type: 'clear_pending_block_selection' });
        handleBlockSaveSuccess();
    }

    const handleSaveProgram = async (programData) => {
        const duplicateSource = builderState.mode === 'duplicate' ? builderState.duplicateSource : null;
        const apiData = {
            name: programData.name,
            description: programData.description || '',
            color: programData.color || null,
            start_date: programData.startDate,
            end_date: programData.endDate,
            selectedGoals: programData.selectedGoals,
        };

        if (builderState.mode === 'edit' && displayProgram) {
            await fractalApi.updateProgram(rootId, displayProgram.id, apiData);
            notify.success('Program updated');
        } else {
            const res = await fractalApi.createProgram(rootId, apiData);
            const newProgramId = res.data.id;

            if (duplicateSource) {
                const dayOffset = getDayOffset(duplicateSource.start_date, programData.startDate);
                for (const sourceBlock of duplicateSource.blocks || duplicateSource.weekly_schedule || []) {
                    const blockRes = await fractalApi.createBlock(rootId, newProgramId, {
                        name: sourceBlock.name,
                        start_date: shiftDatePart(sourceBlock.start_date, dayOffset),
                        end_date: shiftDatePart(sourceBlock.end_date, dayOffset),
                        color: sourceBlock.color,
                        goal_ids: sourceBlock.goal_ids || [],
                    });
                    const newBlockId = blockRes.data.id;

                    for (const sourceDay of sourceBlock.days || []) {
                        await fractalApi.addBlockDay(rootId, newProgramId, newBlockId, {
                            name: sourceDay.name,
                            date: shiftDatePart(sourceDay.date, dayOffset),
                            day_number: sourceDay.day_number,
                            day_of_week: sourceDay.day_of_week || [],
                            template_ids: (sourceDay.templates || []).map((template) => template.id).filter(Boolean),
                            template_configs: (sourceDay.templates || []).map((template, index) => ({
                                template_id: template.id,
                                is_required: template.is_required !== false,
                                order: template.order ?? index,
                            })).filter((config) => Boolean(config.template_id)),
                            completion_min_templates: sourceDay.completion_min_templates || null,
                        });
                    }
                }
            }

            dispatchCalendarContext({
                type: 'focus_day',
                date: programData.startDate || contextDate,
                programId: newProgramId,
            });
            notify.success(duplicateSource ? 'Program duplicated' : 'Program created');
        }
        await refetchPrograms();
        await refreshData?.();
    };

    const requestDeleteProgram = async (program) => {
        try {
            const countRes = await fractalApi.getProgramSessionCount(rootId, program.id);
            setDeleteSessionCount(countRes.data.session_count);
            setProgramToDelete(program);
        } catch (error) {
            notify.error(`Failed to fetch session count: ${error.response?.data?.error || error.message}`);
        }
    };

    const confirmDeleteProgram = async () => {
        if (!programToDelete) return;
        try {
            await fractalApi.deleteProgram(rootId, programToDelete.id);
            notify.success('Program deleted');
            setProgramToDelete(null);
            setDeleteSessionCount(0);
            if (selectedProgramId === programToDelete.id) {
                dispatchCalendarContext({
                    type: 'focus_day',
                    date: contextDate,
                    programId: null,
                });
            }
            await refetchPrograms();
        } catch (error) {
            notify.error(`Failed to delete program: ${error.response?.data?.error || error.message}`);
        }
    };

    const handleEditProgramOption = () => {
        if (!displayProgram) return;
        setIsProgramOptionsOpen(false);
        setProgramOptionsView('actions');
        setBuilderState({ open: true, mode: 'edit', startDate: '', duplicateSource: null });
    };

    const handleDeleteProgramOption = () => {
        if (!displayProgram) return;
        setIsProgramOptionsOpen(false);
        setProgramOptionsView('actions');
        requestDeleteProgram(displayProgram);
    };

    const handleCreateProgramOption = () => {
        setIsProgramOptionsOpen(false);
        setProgramOptionsView('actions');
        openCreateProgram();
    };

    const handleDuplicateProgramOption = () => {
        if (!displayProgram) return;
        setIsProgramOptionsOpen(false);
        setProgramOptionsView('actions');
        setBuilderState({
            open: true,
            mode: 'duplicate',
            startDate: '',
            duplicateSource: displayProgram,
        });
    };

    const handleCreateProgramNote = async (content) => {
        if (!displayProgram) return;
        await programNotesQuery.createNote({
            content,
            context_type: 'program',
            context_id: displayProgram.id,
        });
    };

    const handleSelectProgramOption = (program) => {
        dispatchCalendarContext({
            type: 'focus_day',
            date: getDatePart(program.start_date) || contextDate,
            programId: program.id,
        });
        closeDayViewModal();
        setIsProgramOptionsOpen(false);
        setProgramOptionsView('actions');
    };

    const closeProgramOptions = () => {
        setIsProgramOptionsOpen(false);
        setProgramOptionsView('actions');
        setProgramPickerQuery('');
        setProgramPickerFilter('all');
    };

    const programOptionsTitle = {
        actions: 'Program Options',
        programs: 'Other Programs',
    }[programOptionsView] || 'Program Options';

    const viewActions = displayProgram ? (
        <>
            <div className={styles.viewToggle} aria-label="Program view">
                <button
                    className={`${styles.toggleButton} ${viewMode === 'calendar' ? styles.toggleButtonActive : ''}`}
                    onClick={() => setViewMode('calendar')}
                >
                    Calendar
                </button>
                <button
                    className={`${styles.toggleButton} ${viewMode === 'blocks' ? styles.toggleButtonActive : ''}`}
                    onClick={() => setViewMode('blocks')}
                >
                    Blocks
                </button>
            </div>
            <HeaderButton variant="secondary" onClick={() => setIsProgramOptionsOpen(true)}>
                Program Options
            </HeaderButton>
            <HeaderButton variant="secondary" onClick={() => setIsSidePaneVisible((visible) => !visible)}>
                {isSidePaneVisible ? 'Hide Sidebar' : 'Show Sidebar'}
            </HeaderButton>
        </>
    ) : (
        <>
            <HeaderButton variant="secondary" onClick={() => setIsProgramOptionsOpen(true)}>
                Program Options
            </HeaderButton>
            <HeaderButton variant="secondary" onClick={() => setIsSidePaneVisible((visible) => !visible)}>
                {isSidePaneVisible ? 'Hide Sidebar' : 'Show Sidebar'}
            </HeaderButton>
        </>
    );

    return (
        <div className={styles.container}>
            <div className={`${styles.workspace} ${!isSidePaneVisible ? styles.workspaceNoSidePane : ''}`}>
                <div className={`${styles.mainColumn} ${viewMode === 'blocks' ? styles.mainColumnBlocksMode : ''}`}>
                    <PageHeader
                        title={pageTitle}
                        subtitle={pageSubtitle}
                        hideTitleOnMobile={false}
                        compactMobileContext
                        actions={viewActions}
                    />

                    <div className={`${styles.calendarPanel} ${viewMode === 'blocks' ? styles.blocksModePanel : ''}`}>
                        {loading || (viewMode === 'blocks' && detailLoading) ? (
                            <div className={styles.loading}>Loading programs...</div>
                        ) : viewMode === 'calendar' ? (
                            <ProgramCalendarView
                                calendarEvents={calendarEvents}
                                blockLabels={blockLabels}
                                blockCreationMode={blockCreationMode}
                                setBlockCreationMode={setBlockCreationModeForCalendar}
                                onAddBlockClick={handleAddSelectedBlock}
                                showBlockControls
                                selectedRangeLabel={selectedCalendarRange ? `${selectedCalendarRange.startDate} - ${selectedCalendarRange.endDate}` : ''}
                                showAddBlockButton={Boolean(pendingBlockSelection)}
                                onDateClick={handleDateClick}
                                onEventClick={handleEventClick}
                                onDateSelect={handleDateSelectForContext}
                                initialDate={contextDate}
                                isMobile={isMobile}
                                selectedDate={selectedCalendarRange ? null : contextDate}
                                selectedRange={selectedCalendarRange}
                                onCalendarBackgroundClick={handleCalendarBackgroundClick}
                                onTodayClick={resetCalendarContextToToday}
                                onBlockLabelClick={handleBlockLabelClick}
                            />
                        ) : displayProgram ? (
                            <div className={styles.blocksPanel}>
                                <ProgramBlockView
                                    blocks={sortedBlocks}
                                    blockGoalsByBlockId={blockGoalsByBlockId}
                                    sessions={sessions}
                                    onEditDay={handleEditDay}
                                    onAttachGoal={handleAttachGoalClick}
                                    onEditBlock={handleEditBlockClick}
                                    onDeleteBlock={deleteBlock}
                                    onAddDay={handleAddDayClick}
                                    onGoalClick={openGoalModal}
                                    onAddBlock={handleAddBlockClick}
                                />
                            </div>
                        ) : (
                            <div className={styles.emptyBlocksPanel}>
                                <h2>No Program Active</h2>
                                <p>Select a program on the calendar or create a new one to manage blocks.</p>
                            </div>
                        )}
                    </div>
                </div>

                {isSidePaneVisible ? (
                    <ProgramSidePane
                        program={displayProgram}
                        goals={displayGoals}
                        onCreate={() => openCreateProgram()}
                        onCollapse={() => setIsSidePaneVisible(false)}
                        view={sidePaneView}
                        onViewChange={setSidePaneView}
                        programMetrics={programMetrics}
                        activeBlock={activeBlock}
                        blockMetrics={blockMetrics}
                        programGoalSeeds={hierarchyGoalSeeds}
                        onGoalClick={openGoalModal}
                        notesQuery={programNotesQuery}
                        notes={programNotes}
                        onCreateNote={handleCreateProgramNote}
                    />
                ) : null}
            </div>

            <ProgramBuilder
                isOpen={builderState.open}
                onClose={closeBuilder}
                onSave={handleSaveProgram}
                initialData={builderState.mode === 'edit' ? displayProgram : duplicateInitialData}
                initialStartDate={builderState.startDate}
                title={builderState.mode === 'duplicate' ? 'Duplicate Program' : undefined}
                submitLabel={builderState.mode === 'duplicate' ? 'Duplicate Program' : undefined}
            />

            <Modal
                isOpen={isProgramOptionsOpen}
                onClose={closeProgramOptions}
                title={programOptionsTitle}
                size={programOptionsView === 'actions' ? 'sm' : 'md'}
            >
                {programOptionsView === 'programs' ? (
                    <div className={styles.programPicker}>
                        <button
                            className={styles.backButton}
                            onClick={() => setProgramOptionsView('actions')}
                        >
                            Back to Options
                        </button>

                        {programs.length === 0 ? (
                            <div className={styles.programPickerEmpty}>
                                <p>No programs yet.</p>
                                <button className={styles.primaryButton} onClick={handleCreateProgramOption}>
                                    Create a New Program
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className={styles.programPickerControls}>
                                    <input
                                        className={styles.programPickerSearch}
                                        type="search"
                                        value={programPickerQuery}
                                        onChange={(event) => setProgramPickerQuery(event.target.value)}
                                        placeholder="Search programs"
                                        aria-label="Search programs"
                                    />
                                    <div className={styles.programPickerFilters} aria-label="Filter programs">
                                        {[
                                            ['all', 'All'],
                                            ['active', 'Active'],
                                            ['upcoming', 'Upcoming'],
                                            ['completed', 'Completed'],
                                        ].map(([value, label]) => (
                                            <button
                                                key={value}
                                                className={`${styles.programPickerFilterButton} ${programPickerFilter === value ? styles.programPickerFilterButtonActive : ''}`}
                                                onClick={() => setProgramPickerFilter(value)}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {filteredProgramCount === 0 ? (
                                    <div className={styles.programPickerEmpty}>
                                        <p>No programs match your filters.</p>
                                    </div>
                                ) : null}

                                {[
                                    ['Active Program', groupedPrograms.active],
                                    ['Upcoming', groupedPrograms.upcoming],
                                    ['Completed', groupedPrograms.completed],
                                ].map(([label, group]) => (
                                    group.length ? (
                                        <section className={styles.programPickerGroup} key={label}>
                                            <h3 className={styles.programPickerGroupTitle}>{label}</h3>
                                            <div className={styles.programPickerList}>
                                                {group.map((program) => {
                                                    const status = getProgramStatus(program, todayInTimezone);
                                                    const isSelected = program.id === displayProgram?.id;

                                                    return (
                                                        <button
                                                            key={program.id}
                                                            className={`${styles.programPickerRow} ${isSelected ? styles.programPickerRowSelected : ''}`}
                                                            onClick={() => handleSelectProgramOption(program)}
                                                        >
                                                            <span className={styles.programPickerMain}>
                                                                <span className={styles.programPickerName}>{program.name}</span>
                                                                <span className={styles.programPickerDates}>
                                                                    {formatLiteralDate(program.start_date)} - {formatLiteralDate(program.end_date)}
                                                                </span>
                                                            </span>
                                                            <span className={`${styles.statusBadge} ${styles[getStatusBadgeClass(status)]}`}>
                                                                {getStatusLabel(status)}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    ) : null
                                ))}
                            </>
                        )}
                    </div>
                ) : (
                    <div className={styles.optionsModalBody}>
                        <button
                            className={styles.optionButton}
                            onClick={handleEditProgramOption}
                            disabled={!displayProgram}
                        >
                            <span className={styles.optionTitle}>Edit Program</span>
                            <span className={styles.optionDescription}>
                                Update the name, dates, description, and attached goals.
                            </span>
                        </button>
                        <button
                            className={`${styles.optionButton} ${styles.optionButtonDanger}`}
                            onClick={handleDeleteProgramOption}
                            disabled={!displayProgram}
                        >
                            <span className={styles.optionTitle}>Delete Program</span>
                            <span className={styles.optionDescription}>
                                Remove this program and clear its session associations.
                            </span>
                        </button>
                        <button
                            className={styles.optionButton}
                            onClick={handleDuplicateProgramOption}
                            disabled={!displayProgram}
                        >
                            <span className={styles.optionTitle}>Duplicate Program</span>
                            <span className={styles.optionDescription}>
                                Copy this program's goals, blocks, and planned days into a new date range.
                            </span>
                        </button>
                        <button
                            className={styles.optionButton}
                            onClick={handleCreateProgramOption}
                        >
                            <span className={styles.optionTitle}>Create a New Program</span>
                            <span className={styles.optionDescription}>
                                Start another program with its own date range and goals.
                            </span>
                        </button>
                        <button
                            className={styles.optionButton}
                            onClick={() => setProgramOptionsView('programs')}
                        >
                            <span className={styles.optionTitle}>View Other Programs</span>
                            <span className={styles.optionDescription}>
                                Browse active, upcoming, and completed programs.
                            </span>
                        </button>
                        <button
                            className={styles.optionButton}
                            onClick={() => {
                                setSidePaneView('goals');
                                setIsSidePaneVisible(true);
                                closeProgramOptions();
                            }}
                            disabled={!displayProgram}
                        >
                            <span className={styles.optionTitle}>Program Goals</span>
                            <span className={styles.optionDescription}>
                                View the goals associated with this program and track progress.
                            </span>
                        </button>
                    </div>
                )}
            </Modal>

            <DeleteProgramModal
                isOpen={Boolean(programToDelete)}
                onClose={() => {
                    setProgramToDelete(null);
                    setDeleteSessionCount(0);
                }}
                onConfirm={confirmDeleteProgram}
                programName={programToDelete?.name || ''}
                sessionCount={deleteSessionCount}
                requireMatchingText="delete"
            />

            {showBlockModal && displayProgram && (
                <Suspense fallback={null}>
                    <ProgramBlockModal
                        isOpen={showBlockModal}
                        onClose={closeBlockModal}
                        onSave={saveBlock}
                        initialData={blockModalData}
                        programDates={{ start: displayProgram.start_date, end: displayProgram.end_date }}
                    />
                </Suspense>
            )}
            {showDayModal && (
                <Suspense fallback={null}>
                    <ProgramDayModal
                        isOpen={showDayModal}
                        onClose={closeDayModal}
                        onSave={saveDay}
                        onCopy={copyDay}
                        onDelete={deleteDay}
                        rootId={rootId}
                        blockId={selectedBlockId}
                        initialData={dayModalInitialData}
                    />
                </Suspense>
            )}
            {showAttachModal && (
                <Suspense fallback={null}>
                    <AttachGoalModal
                        isOpen={showAttachModal}
                        onClose={closeAttachModal}
                        onSave={saveAttachedGoal}
                        goals={attachableBlockGoals}
                        block={attachBlock}
                        associatedGoalIds={(blockGoalsByBlockId.get(attachBlock?.id) || []).map((goal) => goal.id)}
                    />
                </Suspense>
            )}
            {showDayViewModal && (
                <Suspense fallback={null}>
                    <DayViewModal
                        isOpen={showDayViewModal}
                        onClose={closeDayViewModal}
                        date={selectedDate}
                        program={displayProgram}
                        goals={displayGoals}
                        onSetGoalDeadline={handleCalendarGoalDeadline}
                        onAttachGoalToDay={saveDayGoal}
                        blocks={sortedBlocks}
                        onScheduleDay={scheduleDay}
                        onCreateDayForDate={handleCreateDayForDate}
                        onUnscheduleDay={handleUnscheduleDay}
                        sessions={sessions}
                    />
                </Suspense>
            )}

            <ConfirmationModal
                isOpen={unscheduleConfirmOpen}
                onClose={closeUnscheduleConfirm}
                onConfirm={unscheduleDay}
                title="Unschedule Day"
                message={
                    itemToUnschedule?.isRecurringTemplate
                        ? `Remove scheduled sessions for "${itemToUnschedule?.name || 'this day'}" on ${selectedDate || 'this date'}?`
                        : `Are you sure you want to unschedule ${itemToUnschedule?.name || 'this day'}?`
                }
                confirmText="Unschedule"
            />

            <Suspense fallback={null}>
                {showGoalModal && displayProgram && (
                    <GoalDetailModal
                        isOpen={showGoalModal}
                        onClose={closeGoalModal}
                        goal={selectedGoal}
                        onUpdate={updateGoal}
                        onToggleCompletion={toggleGoalCompletion}
                        onDelete={deleteGoal}
                        onAddChild={handleAddChildGoal}
                        rootId={rootId}
                        treeData={treeData}
                        sessions={sessions}
                        programs={[displayProgram]}
                        activityDefinitions={activities}
                        activityGroups={activityGroups}
                        displayMode="modal"
                        mode={modalMode}
                        onCreate={createGoal}
                        parentGoal={selectedParent}
                    />
                )}
            </Suspense>
        </div>
    );
}

export default ProgramCalendarPage;
