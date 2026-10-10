import React, { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import EmptyState from '../components/common/EmptyState';
import ViewToggleTabs from '../components/common/ViewToggleTabs';
import DeleteProgramModal from '../components/modals/DeleteProgramModal';
import ProgramBuilder from '../components/modals/ProgramBuilder';
import ProgramBlocksPanel from '../components/programs/ProgramBlocksPanel';
import ProgramStatusBadge from '../components/programs/ProgramStatusBadge';
import ProgramCalendarView from '../components/programs/ProgramCalendarView';
import CalendarPeriodModal from '../components/programs/CalendarPeriodModal';
import ProgramDayStatusBulkBar from '../components/programs/ProgramDayStatusBulkBar';
import ResponsiveProgramSidePane from '../components/programs/ResponsiveProgramSidePane';
import Modal from '../components/atoms/Modal';
import PageHeader from '../components/layout/PageHeader';
import HeaderButton from '../components/layout/HeaderButton';
import MobilePageFooter from '../components/layout/MobilePageFooter';
import { useOptionalOnboarding } from '../contexts/OnboardingContext';
import { useGoals } from '../contexts/GoalsContext';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useTimezone } from '../contexts/TimezoneContext';
import { useProgramData } from '../hooks/useProgramData';
import { useProgramDetailController } from '../hooks/useProgramDetailController';
import { useProgramDetailMutations } from '../hooks/useProgramDetailMutations';
import { useProgramDetailViewModel } from '../hooks/useProgramDetailViewModel';
import { useProgramGoalSets } from '../hooks/useProgramGoalSets';
import { programFocusScope } from '../utils/programFocus';
import { duplicateProgramStructure, shiftDatePart } from '../utils/programDuplication';
import { useProgramMetrics } from '../hooks/useProgramMetrics';
import { buildBlockCards } from '../utils/programBlocksViewModel';
import { useProgramCalendarSelection } from '../hooks/useProgramCalendarSelection';
import { useProgramStatusSelection } from '../hooks/useProgramStatusSelection';
import {
    useProgramDayDetail,
    useSetProgramDaySessionCredit,
    useUpdateProgramDayStatuses,
} from '../hooks/useProgramDayReadModel';
import { useProgramsCalendarData } from '../hooks/useProgramsCalendarData';
import useProgramDaysTab from '../hooks/useProgramDaysTab';
import { useProgramCalendarFeed } from '../hooks/useProgramCalendarFeed';
import useIsMobile, { getIsMobileViewport } from '../hooks/useIsMobile';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { addDaysToDateString, formatLiteralDate, getISOYMDInTimezone, subtractDaysToDateString } from '../utils/dateUtils';
import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { nestContributingSessionsInProgramDays } from '../utils/programDayState';
import { attachFeedBlocks, buildCalendarFeedEvents } from '../utils/programCalendarFeed';
import { useCalendarPeriodEditor } from '../hooks/useCalendarPeriods';
import { createProgramCalendarContext, formatProgramCalendarSelection, getProgramOverviewMetricsRange, programCalendarContextReducer } from '../utils/programCalendarContext';
import { buildProgramBlockLabels, buildProgramsCalendarEvents, getProgramColor } from '../utils/programViewModel';
import { getProgramStatus, isProgramActive } from '../utils/programGoalWindow';
import { readLocalStorageValue, writeLocalStorageValue } from '../utils/localPreferences';
import styles from './ProgramCalendarPage.module.css';

const ProgramBlockModal = lazyWithRetry(() => import('../components/modals/ProgramBlockModal'), 'components/modals/ProgramBlockModal');
// Per-viewer convenience: whether the calendar scrolls weeks continuously.
const CONTINUOUS_CALENDAR_PREFERENCE_KEY = 'program-calendar-continuous';
const ProgramDayModal = lazyWithRetry(() => import('../components/modals/ProgramDayModal'), 'components/modals/ProgramDayModal');
const GoalDetailModal = lazyWithRetry(() => import('../components/ConnectedGoalDetailModal'), 'components/ConnectedGoalDetailModal');
const ProgramDaysView = lazyWithRetry(() => import('../components/programs/days/ProgramDaysView'), 'components/programs/days/ProgramDaysView');
const PROGRAM_VIEW_ITEMS = ['calendar', 'days'].map((value) => ({ value, label: `${value[0].toUpperCase()}${value.slice(1)}` }));
function getDatePart(dateValue) {
    if (!dateValue) return null;
    return String(dateValue).split('T')[0];
}

/** The six-week month grid around `dateValue`: the first rows in view on load, in either mode. */
function getInitialCalendarRange(dateValue) {
    const [year, month] = dateValue.slice(0, 7).split('-').map(Number);
    const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
    firstOfMonth.setUTCDate(firstOfMonth.getUTCDate() - firstOfMonth.getUTCDay());
    const start = firstOfMonth.toISOString().slice(0, 10);
    return { start, end: addDaysToDateString(start, 41) };
}

function ProgramCalendarPage() {
    const onboarding = useOptionalOnboarding();
    const { rootId, programId } = useParams();
    const location = useLocation();
    const isMobile = useIsMobile();
    const { setActiveRootId } = useGoals();
    const { getGoalColor, getGoalTextColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
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
        scope: calendarScope,
        contextProgramId,
        contextDate,
        selectedRange: selectedCalendarRange,
        pendingBlockSelection,
    } = calendarContext;
    const [isCalendarContinuous, setIsCalendarContinuous] = useState(
        () => readLocalStorageValue(CONTINUOUS_CALENDAR_PREFERENCE_KEY) === 'true',
    );
    const [visibleCalendarRange, setVisibleCalendarRange] = useState(
        () => getInitialCalendarRange(todayInTimezone),
    );
    const handleCalendarContinuousChange = useCallback((enabled) => {
        setIsCalendarContinuous(enabled);
        writeLocalStorageValue(CONTINUOUS_CALENDAR_PREFERENCE_KEY, String(enabled));
    }, []);
    const [viewMode, setViewMode] = useState('calendar');
    // Desktop remembers whether the side pane is open (per fractal), like the Notes filters pane;
    // the mobile sheet always starts closed.
    const sidePaneStorageKey = `programs-side-pane-open:${rootId || 'default'}`;
    const [isSidePaneVisible, setIsSidePaneVisible] = useState(() => {
        if (getIsMobileViewport()) return false;
        try {
            return window.localStorage.getItem(sidePaneStorageKey) !== 'false';
        } catch {
            return true;
        }
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
        programLabels,
        loading,
        refetchPrograms,
    } = useProgramsCalendarData(rootId, { timezone });

    const activeProgramId = useMemo(
        () => programs.find((program) => isProgramActive(program, todayInTimezone))?.id || null,
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
    } = useProgramData(rootId, selectedProgramId, timezone || 'UTC');

    const displayProgram = detailedProgram || selectedProgram;
    // Everything the calendar draws for the rows in view, across every program.
    const {
        feed: calendarFeed,
        loadingMonths: calendarLoadingMonths,
    } = useProgramCalendarFeed(rootId, timezone, visibleCalendarRange);
    const calendarPrograms = useMemo(
        () => attachFeedBlocks(programs, calendarFeed.blocks),
        [calendarFeed.blocks, programs],
    );
    const goalDeadlineEvents = useMemo(() => buildProgramsCalendarEvents(
        [],
        goals,
        getGoalColor,
        getGoalTextColor,
        timezone,
        { getGoalSecondaryColor, getGoalIcon },
    ), [getGoalColor, getGoalIcon, getGoalSecondaryColor, getGoalTextColor, goals, timezone]);
    const blockLabels = useMemo(() => (
        calendarPrograms.flatMap((program) => buildProgramBlockLabels({
            program,
            includeProgramId: true,
        }))
    ), [calendarPrograms]);
    // The selected program's date facts drive status marks, streaks, and selection.
    const selectedDayStates = useMemo(() => (
        displayProgram
            ? calendarFeed.programDays.filter((day) => String(day.program_id) === String(displayProgram.id))
            : []
    ), [calendarFeed.programDays, displayProgram]);
    const dayDetailQuery = useProgramDayDetail(
        rootId,
        displayProgram?.id,
        timezone,
        calendarScope === 'day' ? contextDate : null,
    );
    const dayStatusMutation = useUpdateProgramDayStatuses(rootId, displayProgram?.id);
    const sessionCreditMutation = useSetProgramDaySessionCredit(rootId, displayProgram?.id, timezone);
    const periodEditor = useCalendarPeriodEditor(rootId);
    const calendarEventsWithSessions = useMemo(() => nestContributingSessionsInProgramDays([
        ...buildCalendarFeedEvents({
            feed: calendarFeed,
            programs: calendarPrograms,
            selectedProgramId: displayProgram?.id || null,
        }),
        ...goalDeadlineEvents,
    ]), [calendarFeed, calendarPrograms, displayProgram?.id, goalDeadlineEvents]);
    const displayGoals = detailGoals?.length ? detailGoals : goals;

    const {
        attachedGoalIds,
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
        dayModalInitialData,
        showGoalModal,
        selectedGoal,
        modalMode,
        selectedParent,
        blockCreationMode,
        setBlockCreationMode,
        openGoalModal,
        closeGoalModal,
        handleAddBlockClick,
        handleEditBlockClick,
        closeBlockModal,
        handleBlockSaveSuccess,
        handleAddDayClick,
        handleCreateDayForDate,
        handleEditDay,
        closeDayModal,
        handleDaySaveSuccess,
        handleAddChildGoal,
    } = useProgramDetailController({ goals: displayGoals });
    const showSavedDayRef = useRef(null);
    const {
        updateRangeContext: updateCalendarRangeContext,
        programForDate,
        extendMultiDaySelection,
        selectCalendarRange: handleDateSelectForContext,
        resetToToday: resetCalendarContextToToday,
        selectBlockRange: handleBlockLabelClick,
        setMultiDayMode: setBlockCreationModeForCalendar,
    } = useProgramCalendarSelection({
        calendarContext,
        dispatchCalendarContext,
        displayProgram,
        programs,
        today: todayInTimezone,
        blockCreationMode,
        setBlockCreationMode,
        setIsSidePaneVisible,
    });

    const selectableDayStates = useMemo(() => selectedDayStates.filter((day) => (
        isProgramActive(displayProgram, day.date))), [displayProgram, selectedDayStates]);
    const {
        selectedStatusDates,
        selectedScheduledDates,
        selectionModeButtonRef,
        setMultiDaySelectionMode,
        clearStatusSelection,
        toggleStatusDate,
        selectStatusRange,
    } = useProgramStatusSelection(selectableDayStates, blockCreationMode, setBlockCreationModeForCalendar);
    const selectedTimeframeDates = blockCreationMode ? selectedStatusDates : [];
    const selectedTimeframeLabel = formatProgramCalendarSelection(selectedTimeframeDates);
    const overviewMetricsRange = selectedTimeframeDates.length
        ? { dates: selectedTimeframeDates }
        : getProgramOverviewMetricsRange(calendarContext);
    const overviewMetricsQuery = useProgramMetrics(
        rootId, displayProgram?.id, timezone, overviewMetricsRange,
    );
    // The calendar pane's Blocks section always summarizes the whole program, whatever is selected.
    const blockMetricsQuery = useProgramMetrics(
        rootId, viewMode === 'calendar' ? displayProgram?.id : null, timezone,
    );

    useEffect(() => {
        if (isMobile) return;
        try {
            window.localStorage.setItem(sidePaneStorageKey, String(isSidePaneVisible));
        } catch {
            // Storage can be unavailable (private windows); the pane still toggles for this visit.
        }
    }, [isMobile, isSidePaneVisible, sidePaneStorageKey]);

    /* eslint-disable react-hooks/set-state-in-effect -- Responsive navigation collapses the desktop side pane on mobile. */
    useEffect(() => {
        if (!rootId || location.pathname.startsWith(`/${rootId}/programs`)) return;

        closeGoalModal();
    }, [closeGoalModal, location.pathname, rootId]);

    const {
        sortedBlocks,
    } = useProgramDetailViewModel({
        program: displayProgram,
        goals: displayGoals,
        sessions,
        timezone,
        getGoalColor,
        getGoalTextColor,
        attachedGoalIds,
        hierarchyGoalSeeds,
    });
    const blockCards = useMemo(() => buildBlockCards({
        blocks: sortedBlocks,
        metrics: blockMetricsQuery.data,
        today: todayInTimezone,
    }), [blockMetricsQuery.data, sortedBlocks, todayInTimezone]);
    const {
        saveBlock,
        deleteBlock,
        saveDay,
        duplicateDay,
        reorderDays,
        deleteDay,
        scheduleDay,
        unscheduleDay,
        updateGoal,
        toggleGoalCompletion,
        deleteGoal,
        createGoal,
    } = useProgramDetailMutations({
        rootId,
        program: displayProgram,
        refreshData,
        refreshers,
        sessions,
        dayModalInitialData,
        onBlockSaved: handleProgramBlockSaveSuccess,
        onDaySaved: handleProgramDaySaved,
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
            const bucket = getProgramStatus(program, todayInTimezone);
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
        ? sortedBlocks.find((block) => isProgramActive(block, contextDate))
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
        { key: 'date', label: selectedTimeframeLabel || selectedRangeText || selectedDateText },
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
    // The program's span and status. Desktop shows it on the title row beside the header
    // actions; mobile hides the title copy, so it stays the subtitle there.
    const programMeta = displayProgram ? (
        <span className={styles.headerMetaRow}>
            <span>{formatLiteralDate(displayProgram.start_date)} - {formatLiteralDate(displayProgram.end_date)}</span>
            {displayProgramStatus ? (
                <ProgramStatusBadge status={displayProgramStatus} />
            ) : null}
            {selectedTimeframeLabel ? <span>{selectedTimeframeLabel}</span>
                : selectedRangeText ? <span>Selected {selectedRangeText}</span> : null}
        </span>
    ) : null;
    const pageSubtitle = displayProgram
        ? (isMobile ? programMeta : null)
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
    /* eslint-enable react-hooks/set-state-in-effect */

    const openCreateProgram = (startDate = '') => {
        setBuilderState({ open: true, mode: 'create', startDate, duplicateSource: null });
    };

    const updateDayStatuses = async (dates, status, acknowledgeCompletedEvidence = false) => {
        if (!dates.length || !displayProgram) return false;
        try {
            await dayStatusMutation.mutateAsync({
                dates,
                status,
                timezone: timezone || 'UTC',
                acknowledge_completed_evidence: acknowledgeCompletedEvidence,
            });
            notify.success(status === 'automatic'
                ? `${dates.length} day${dates.length === 1 ? '' : 's'} returned to automatic status`
                : `${dates.length} day${dates.length === 1 ? '' : 's'} marked ${status}`);
            return true;
        } catch (error) {
            const payload = error.response?.data;
            if (status === 'rest'
                && payload?.code === 'completed_evidence_confirmation_required'
                && !acknowledgeCompletedEvidence) {
                const confirmed = window.confirm(
                    `Completed sessions exist on ${payload.dates.length} selected day${payload.dates.length === 1 ? '' : 's'}. Mark as rest while keeping those sessions?`,
                );
                if (confirmed) return updateDayStatuses(dates, status, true);
                return false;
            }
            notify.error(payload?.error || 'Program day statuses could not be updated');
            return false;
        }
    };

    const updateSessionCredit = async (session, disposition, templateId = null) => {
        if (!displayProgram || !contextDate) return false;
        try {
            await sessionCreditMutation.mutateAsync({
                date: contextDate, sessionId: session.id, disposition, templateId,
            });
            const templateName = session.credit_options?.find((option) => option.template_id === templateId)?.name;
            notify.success(disposition === 'credit'
                ? `${session.name} now counts as ${templateName || 'a scheduled template'}`
                : disposition === 'exclude'
                    ? `${session.name} no longer counts toward this day`
                    : `${session.name} uses automatic credit`);
            return true;
        } catch (error) {
            notify.error(error.response?.data?.error || 'Session credit could not be updated');
            return false;
        }
    };

    const applyBulkDayStatus = async (status) => {
        if (await updateDayStatuses(selectedScheduledDates, status)) {
            setMultiDaySelectionMode(false);
        }
    };

    const closeBuilder = () => {
        setBuilderState({ open: false, mode: 'create', startDate: '', duplicateSource: null });
    };

    const handleDateClick = (info) => {
        const clickedDate = info.dateStr;
        const program = programForDate(clickedDate);

        if (blockCreationMode) {
            toggleStatusDate(clickedDate, { extend: Boolean(info.jsEvent?.shiftKey) });
            extendMultiDaySelection(clickedDate);
            return;
        }

        updateCalendarRangeContext({ startDate: clickedDate, program });
        setViewMode('calendar');
        setIsSidePaneVisible(true);
        if (onboarding?.enabled && !onboarding.state?.visited?.includes('program_calendar_day_reviewed')) {
            onboarding.markVisited('program_calendar_day_reviewed');
        }
    };

    const handleProgramLabelClick = (label) => {
        if (blockCreationMode || !label?.date) return;
        const program = programs.find((candidate) => String(candidate.id) === String(label.programId)) || null;
        updateCalendarRangeContext({ startDate: label.date, program });
        setViewMode('calendar');
        setIsSidePaneVisible(true);
    };

    const handleEventClick = (info) => {
        const eventType = info.event.extendedProps?.type;

        if (blockCreationMode && eventType !== 'block_background' && eventType !== 'program_background') {
            const clickedDate = info.event.startStr ? getDatePart(info.event.startStr) : contextDate;
            toggleStatusDate(clickedDate, { extend: Boolean(info.jsEvent?.shiftKey) });
            extendMultiDaySelection(clickedDate);
            return;
        }

        if (eventType === 'block_background' || eventType === 'program_background') {
            return;
        }
        if (eventType === 'calendar_period') return periodEditor.openEdit(info.event.extendedProps.period);

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
        updateCalendarRangeContext({
            startDate: clickedDate,
            program: programs.find((candidate) => candidate.id === programId) || null,
        });
        setViewMode('calendar');
        setIsSidePaneVisible(true);
    };

    const moveScopedDay = (offset) => {
        const nextDate = shiftDatePart(contextDate, offset);
        if (!nextDate || !displayProgram || !isProgramActive(displayProgram, nextDate)) return;
        dispatchCalendarContext({ type: 'focus_day', date: nextDate, programId: displayProgram.id });
    };

    // The calendar reports the rows actually on screen (the month grid, or the
    // scrolled continuous rows); the feed loads the month chunks they touch.
    const handleCalendarVisibleRangeChange = useCallback((range) => {
        setVisibleCalendarRange((current) => (
            current?.start === range.start && current?.end === range.end ? current : range
        ));
    }, []);

    const handleCalendarBackgroundClick = (event) => {
        if (blockCreationMode) return;
        const interactiveTarget = event.target.closest(
            '.fc-daygrid-day, .fc-event, .fc-button, button, a, input, select, textarea'
        );

        if (interactiveTarget) {
            return;
        }

        if (displayProgram && getProgramStatus(displayProgram, todayInTimezone) === 'completed') {
            dispatchCalendarContext({
                type: 'focus_program',
                date: contextDate,
                programId: displayProgram.id,
            });
            clearStatusSelection();
            return;
        }

        resetCalendarContextToToday();
        clearStatusSelection();
    };

    const handleAddSelectedBlock = () => {
        if (!pendingBlockSelection) return;
        handleAddBlockClick(pendingBlockSelection);
    };

    // The side pane's footer: a selected timeframe seeds the dates; otherwise a new block
    // picks up the day after the last block ends.
    const handleCreateBlockFromPane = () => {
        if (selectedTimeframeDates.length) {
            const sorted = [...selectedTimeframeDates].sort();
            handleAddBlockClick({ startDate: sorted[0], endDate: sorted[sorted.length - 1] });
            return;
        }
        const lastEnd = sortedBlocks.reduce((latest, block) => (
            block.end_date && (!latest || block.end_date > latest) ? block.end_date : latest
        ), null);
        const nextStart = lastEnd ? addDaysToDateString(lastEnd, 1) : null;
        const programEnd = displayProgram?.end_date?.slice(0, 10);
        handleAddBlockClick(nextStart && (!programEnd || nextStart <= programEnd) ? { startDate: nextStart } : null);
    };

    function handleProgramBlockSaveSuccess() {
        dispatchCalendarContext({ type: 'clear_pending_block_selection' });
        handleBlockSaveSuccess();
        onboarding?.refresh();
    }

    // A created or duplicated day becomes the Days tab's selection (the tab is set up below).
    function handleProgramDaySaved(savedDay) {
        handleDaySaveSuccess();
        if (savedDay?.id) showSavedDayRef.current?.(savedDay.id);
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
            ...(programData.pruneDayGoals ? { prune_day_goals: true } : {}),
        };

        if (builderState.mode === 'edit' && displayProgram) {
            await fractalApi.updateProgram(rootId, displayProgram.id, apiData);
            notify.success('Program updated');
        } else {
            const res = await fractalApi.createProgram(rootId, apiData);
            const newProgramId = res.data.id;

            if (duplicateSource) {
                await duplicateProgramStructure({
                    rootId,
                    programId: newProgramId,
                    source: duplicateSource,
                    startDate: programData.startDate,
                    programGoalIds: programData.selectedGoals || [],
                });
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
        await onboarding?.refresh();
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
            await onboarding?.refresh();
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

    const handleSelectProgramOption = (program) => {
        dispatchCalendarContext({
            type: 'focus_program',
            date: getDatePart(program.start_date) || contextDate,
            programId: program.id,
        });
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

    const viewToggle = displayProgram ? (
        <ViewToggleTabs
            className={styles.mobileViewToggle}
            items={PROGRAM_VIEW_ITEMS}
            value={viewMode}
            onChange={setViewMode}
            ariaLabel="Program view"
        />
    ) : null;
    // Mobile keeps the view toggle in the header and opens the sidebar from its footer.
    const viewActions = (
        <>
            {isMobile ? viewToggle : null}
            {!isMobile && programMeta ? <span className={styles.headerMetaInline}>{programMeta}</span> : null}
            <HeaderButton variant="secondary" onClick={() => setIsProgramOptionsOpen(true)}>
                Program Options
            </HeaderButton>
            {!isMobile ? (
                <HeaderButton variant="secondary" onClick={() => setIsSidePaneVisible((visible) => !visible)}>
                    {isSidePaneVisible ? 'Hide Sidebar' : 'Show Sidebar'}
                </HeaderButton>
            ) : null}
        </>
    );

    const daysTab = useProgramDaysTab({
        rootId,
        program: displayProgram,
        today: todayInTimezone,
        timezone: timezone || 'UTC',
        enabled: viewMode === 'days',
        setViewMode,
        onLeavePane: () => { if (isMobile) setIsSidePaneVisible(false); },
        onCreateDay: handleAddDayClick,
        onEditDay: handleEditDay,
        onReorderDays: reorderDays,
    });
    useEffect(() => {
        showSavedDayRef.current = daysTab.showDay;
    });

    return (
        <div className={`${styles.container} ${isMobile ? styles.containerWithMobileDock : ''} page-reveal`}>
            <div className={`${styles.workspace} ${!isSidePaneVisible ? styles.workspaceNoSidePane : ''}`}>
                <div className={`${styles.mainColumn} ${viewMode !== 'calendar' ? styles.mainColumnBlocksMode : ''}`}>
                    <PageHeader
                        className={styles.compactHeader}
                        title={pageTitle}
                        subtitle={pageSubtitle}
                        hideTitleOnMobile
                        actions={viewActions}
                    />

                    <div className={[
                        styles.calendarPanel,
                        viewMode !== 'calendar' ? styles.blocksModePanel : '',
                        viewMode === 'days' ? styles.daysModePanel : '',
                    ].filter(Boolean).join(' ')}>
                        {loading || (viewMode !== 'calendar' && detailLoading) ? (
                            <div className={styles.loading}>Loading programs...</div>
                        ) : viewMode === 'calendar' ? (
                            <ProgramCalendarView
                                calendarEvents={calendarEventsWithSessions}
                                blockLabels={blockLabels}
                                blockCreationMode={blockCreationMode}
                                setBlockCreationMode={setMultiDaySelectionMode}
                                onAddBlockClick={handleAddSelectedBlock}
                                showBlockControls
                                selectedRangeLabel={selectedTimeframeLabel || (selectedCalendarRange ? `${selectedCalendarRange.startDate} - ${selectedCalendarRange.endDate}` : '')}
                                showAddBlockButton={Boolean(pendingBlockSelection)}
                                onDateClick={handleDateClick}
                                onEventClick={handleEventClick}
                                onDateSelect={(info) => {
                                    handleDateSelectForContext(info);
                                    if (blockCreationMode && info.startStr < subtractDaysToDateString(info.endStr, 1)) {
                                        selectStatusRange(info);
                                    }
                                }}
                                initialDate={todayInTimezone}
                                isMobile={isMobile}
                                selectedDate={calendarScope === 'day' ? contextDate : null}
                                selectedRange={selectedTimeframeDates.length ? null : selectedCalendarRange}
                                onCalendarBackgroundClick={handleCalendarBackgroundClick}
                                onTodayClick={() => { resetCalendarContextToToday(); clearStatusSelection(); }}
                                onBlockLabelClick={handleBlockLabelClick}
                                onProgramLabelClick={handleProgramLabelClick}
                                programLabels={programLabels}
                                onVisibleRangeChange={handleCalendarVisibleRangeChange}
                                loadingMonths={calendarLoadingMonths}
                                continuous={isCalendarContinuous}
                                onContinuousChange={handleCalendarContinuousChange}
                                dayStates={selectedDayStates}
                                selectedProgramName={displayProgram?.name || ''}
                                selectedProgramId={displayProgram?.id || null}
                                selectedStatusDates={selectedStatusDates}
                                selectableDates={selectableDayStates}
                                selectionModeButtonRef={selectionModeButtonRef}
                                statusActions={blockCreationMode && selectedStatusDates.length ? (
                                    <ProgramDayStatusBulkBar
                                        dates={selectedStatusDates}
                                        scheduledDates={selectedScheduledDates}
                                        today={todayInTimezone}
                                        pending={dayStatusMutation.isPending}
                                        onApply={applyBulkDayStatus}
                                        onPlanTimeOff={() => periodEditor.openCreate(selectedStatusDates)}
                                        onCancel={() => setMultiDaySelectionMode(false)}
                                    />
                                ) : null}
                            />
                        ) : viewMode === 'days' && displayProgram ? (
                            <div className={styles.blocksPanel}>
                                <Suspense fallback={<div className={styles.loading}>Loading days...</div>}>
                                    <ProgramDaysView
                                        rootId={rootId}
                                        program={displayProgram}
                                        activities={activities}
                                        activityGroups={activityGroups}
                                        today={todayInTimezone}
                                        timezone={timezone || 'UTC'}
                                        resolved={daysTab.resolved}
                                        occurrencesQuery={daysTab.occurrencesQuery}
                                        focusTemplateId={daysTab.selection?.templateId || null}
                                        onSelectionChange={daysTab.setSelection}
                                        onEditDay={handleEditDay}
                                        showDayHeading={isMobile}
                                    />
                                </Suspense>
                            </div>
                        ) : (
                            <div className={styles.emptyBlocksPanel}>
                                <h2>No Program Active</h2>
                                <p>Select a program on the calendar or create a new one to plan its days.</p>
                            </div>
                        )}
                    </div>
                </div>

                <ResponsiveProgramSidePane
                    isMobile={isMobile}
                    isVisible={isSidePaneVisible}
                    onClose={() => setIsSidePaneVisible(false)}
                    viewToggle={isMobile ? null : viewToggle}
                    view={sidePaneView}
                    onViewChange={setSidePaneView}
                    program={displayProgram}
                    goals={displayGoals}
                    onCreate={() => openCreateProgram()}
                    programMetrics={overviewMetricsQuery.data}
                    programMetricsLoading={overviewMetricsQuery.isLoading}
                    programMetricsError={overviewMetricsQuery.error}
                    blocksPanel={displayProgram ? (
                        <ProgramBlocksPanel
                            cards={blockCards}
                            loading={blockMetricsQuery.isLoading}
                            error={blockMetricsQuery.error}
                            onEditBlock={handleEditBlockClick}
                            onDeleteBlock={deleteBlock}
                        />
                    ) : null}
                    programGoalSeeds={hierarchyGoalSeeds}
                    onGoalClick={openGoalModal}
                    rootId={rootId}
                    scope={selectedTimeframeDates.length ? 'range' : calendarScope}
                    contextDate={contextDate}
                    selectedRange={selectedCalendarRange}
                    selectionLabel={selectedTimeframeLabel}
                    dayDetailQuery={dayDetailQuery}
                    onPreviousDay={() => moveScopedDay(-1)}
                    onNextDay={() => moveScopedDay(1)}
                    today={todayInTimezone}
                    blocks={sortedBlocks}
                    onScheduleDay={scheduleDay}
                    onUnscheduleDay={(dayId, date) => unscheduleDay(dayId, date, timezone || 'UTC')}
                    onCreateDay={handleCreateDayForDate}
                    getGoalIcon={getGoalIcon}
                    getGoalColor={getGoalColor}
                    getGoalSecondaryColor={getGoalSecondaryColor}
                    timezone={timezone || 'UTC'}
                    onSetDayStatus={(status) => updateDayStatuses([contextDate], status)}
                    dayStatusUpdating={dayStatusMutation.isPending}
                    onEditPeriod={periodEditor.openEdit}
                    onCreateBlock={handleCreateBlockFromPane}
                    onCreateEvent={() => periodEditor.openCreate(selectedTimeframeDates)}
                    onEditPlan={daysTab.openDayPlan}
                    daysNavigator={viewMode === 'days' && displayProgram ? daysTab.navigator : null}
                    onSetSessionCredit={updateSessionCredit}
                    sessionCreditUpdating={sessionCreditMutation.isPending}
                />
            </div>

            {isMobile ? (
                <MobilePageFooter
                    ariaLabel="Program sidebar controls"
                    label={isSidePaneVisible ? 'Hide Sidebar' : 'Show Sidebar'}
                    expanded={isSidePaneVisible}
                    onToggle={() => setIsSidePaneVisible((visible) => !visible)}
                />
            ) : null}

            <CalendarPeriodModal {...periodEditor.modalProps} />
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
                            <EmptyState title="Turn intent into a schedule" description="Programs connect goals, templates, and dates into a practice rhythm you can follow." actionLabel="Create a new program" onAction={handleCreateProgramOption} />
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
                                                            <ProgramStatusBadge status={status} />
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
                        <button className={styles.optionButton} onClick={() => { closeProgramOptions(); setViewMode('calendar'); setMultiDaySelectionMode(true, { restoreFocus: false }); }} disabled={!displayProgram}>
                            <span className={styles.optionTitle}>Plan an Event</span>
                            <span className={styles.optionDescription}>Select days on the calendar, then choose Plan event (e.g. a vacation that protects streaks).</span>
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
                                // Goals are the calendar pane's program-scope Goals view.
                                setViewMode('calendar');
                                setSidePaneView('goals');
                                dispatchCalendarContext({ type: 'focus_program', programId: displayProgram?.id });
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
                        siblingBlocks={displayProgram.blocks || []}
                    />
                </Suspense>
            )}
            {showDayModal && (
                <Suspense fallback={null}>
                    <ProgramDayModal
                        isOpen={showDayModal}
                        onClose={closeDayModal}
                        onSave={saveDay}
                        onDuplicate={duplicateDay}
                        onDelete={deleteDay}
                        rootId={rootId}
                        program={displayProgram}
                        initialData={dayModalInitialData}
                        goals={displayGoals}
                        focusScope={programFocusScope(displayGoals, displayProgram)}
                    />
                </Suspense>
            )}
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
