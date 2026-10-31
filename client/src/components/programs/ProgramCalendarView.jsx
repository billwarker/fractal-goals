import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import useCalendarDragSelection from '../../hooks/useCalendarDragSelection';
import useContinuousCalendarScroll from '../../hooks/useContinuousCalendarScroll';
import { addDaysToDateString } from '../../utils/dateUtils';
import {
    CONTINUOUS_FIRST_DAY,
    formatMonthTitle,
    getContinuousCellMarkers,
    getMonthScrollTarget,
    getMonthStartLabel,
    shiftMonth,
} from '../../utils/programCalendarContinuous';
import { indexProgramDayStates } from '../../utils/programDayState';
import renderProgramCalendarEventContent from './ProgramCalendarEventContent';
import ProgramCalendarToolbar, { ProgramCalendarBlockControls } from './ProgramCalendarToolbar';
import {
    buildBackgroundRanges,
    clearCellDecoration,
    decorateCalendarCell,
    formatCalendarCellDate,
    indexCalendarLabelsByDate,
    normalizeCalendarEventDate,
} from './programCalendarCellDecorations';
import styles from './ProgramCalendarView.module.css';

const CELL_CLASS_NAMES = {
    blockCellLabel: styles.blockCellLabel,
    weekCellLabel: styles.weekCellLabel,
    programCellLabel: styles.programCellLabel,
    blockCellLabelWithWeek: styles.blockCellLabelWithWeek,
    blockCellLabelName: styles.blockCellLabelName,
    weekChip: styles.weekChip,
    dayStatusAssistive: styles.dayStatusAssistive,
    streak: { label: styles.streakLength, line: styles.streakLine, assistive: styles.dayStatusAssistive },
};
const CONTINUOUS_VIEW = 'dayGridContinuous';

function ProgramCalendarView({
    calendarEvents,
    blockLabels = [],
    blockCreationMode,
    setBlockCreationMode,
    onAddBlockClick,
    onDateSelect,
    onDateClick,
    onEventClick,
    isMobile = false,
    showBlockControls = true,
    initialDate = new Date(),
    // Today in the user's timezone preference (YYYY-MM-DD). FullCalendar otherwise takes
    // "today" from the device clock, which disagrees with the rest of the app whenever
    // the preference differs from the device zone (e.g. late evening west of UTC).
    today = null,
    onDatesSet,
    onVisibleMonthChange,
    onVisibleRangeChange,
    loadingMonths = null,
    selectedDate,
    dayMoveMode = false,
    selectedRange,
    selectedRangeLabel,
    showAddBlockButton = true,
    onCalendarBackgroundClick,
    onTodayClick,
    onBlockLabelClick,
    onProgramLabelClick,
    programLabels = [],
    compact = false,
    readOnly = false,
    dayStates = [],
    selectedProgramName = '',
    selectedProgramId = null,
    selectedStatusDates = [],
    selectableDates = null,
    selectionModeButtonRef,
    statusActions = null,
    continuous = false,
    onContinuousChange = null,
    // (goalId, 'YYYY-MM-DD') when a goal from the Goals pane is dropped on a day.
    onGoalDueDrop = null,
}) {
    const calendarRef = React.useRef(null);
    const calendarContainerRef = React.useRef(null);
    const initialDateStr = normalizeCalendarEventDate(initialDate) || formatCalendarCellDate(new Date());
    const todayStr = normalizeCalendarEventDate(today) || initialDateStr;
    const [monthTitle, setMonthTitle] = React.useState('');
    const {
        visibleMonth,
        setVisibleMonth,
        continuousWindow,
        calendarKey,
        getScroller,
        navigateTo: navigateContinuousTo,
        recenter,
        flushPendingScroll,
        reportVisibleRange,
    } = useContinuousCalendarScroll({
        continuous,
        initialDateStr,
        containerRef: calendarContainerRef,
        onVisibleMonthChange,
        onVisibleRangeChange,
    });
    const onEventClickRef = React.useRef(onEventClick);
    const onBlockLabelClickRef = React.useRef(onBlockLabelClick);
    const onProgramLabelClickRef = React.useRef(onProgramLabelClick);
    onEventClickRef.current = onEventClick;
    onBlockLabelClickRef.current = onBlockLabelClick;
    onProgramLabelClickRef.current = onProgramLabelClick;
    const dayStatesByDate = React.useMemo(() => indexProgramDayStates(dayStates), [dayStates]);
    const selectedStatusDateSet = React.useMemo(
        () => new Set(selectedStatusDates),
        [selectedStatusDates],
    );
    // Multi-day mode can select any date inside the selected program; without an
    // explicit list it falls back to scheduled dates.
    const selectableDateSet = React.useMemo(() => new Set(
        (selectableDates || dayStates.filter((day) => day.scheduled)).map((day) => day.date),
    ), [dayStates, selectableDates]);
    const programDayRibbonDates = React.useMemo(() => new Set(
        (calendarEvents || [])
            .filter((event) => event.extendedProps?.type === 'program_day'
                && (!selectedProgramId || String(event.extendedProps?.programId) === String(selectedProgramId)))
            .map((event) => normalizeCalendarEventDate(event.start)),
    ), [calendarEvents, selectedProgramId]);

    const selectableDateList = React.useMemo(() => [...selectableDateSet].sort(), [selectableDateSet]);
    const dragSelection = useCalendarDragSelection({
        enabled: !readOnly && Boolean(blockCreationMode),
        containerRef: calendarContainerRef,
        selectableDates: selectableDateList,
        getScrollContainer: continuous ? getScroller : null,
        onToggleDate: (dateStr, jsEvent) => onDateClick?.({ dateStr, jsEvent }),
        onSelectRange: (dates, jsEvent) => onDateSelect?.({
            startStr: dates[0],
            endStr: addDaysToDateString(dates[dates.length - 1], 1),
            jsEvent,
        }),
    });
    const dragPreviewDates = dragSelection.previewDates;

    const renderCalendarEventContent = React.useCallback((eventInfo) => renderProgramCalendarEventContent(
        eventInfo,
        readOnly ? undefined : (clickInfo) => onEventClickRef.current?.(clickInfo),
        dayStatesByDate.get(normalizeCalendarEventDate(eventInfo.event.start)),
        { markOnly: isMobile },
    ), [dayStatesByDate, readOnly, isMobile]);

    const getDayCellClassNames = (dayInfo) => {
        const dateStr = dayInfo.dateStr || formatCalendarCellDate(dayInfo.date);
        const classNames = [];
        if (selectedRange?.startDate && selectedRange?.endDate
            && dateStr >= selectedRange.startDate
            && dateStr <= selectedRange.endDate) {
            classNames.push(styles.selectedRangeCell);
        }
        if (selectedDate && dateStr === selectedDate) {
            classNames.push(styles.selectedDayCell);
        }
        if (selectedStatusDateSet.has(dateStr)) {
            classNames.push(styles.selectedStatusCell);
        }
        if (continuous) {
            const markers = getContinuousCellMarkers(dateStr);
            if (markers.monthEdgeTop) classNames.push(styles.monthEdgeTop);
            if (markers.monthEdgeLeft) classNames.push(styles.monthEdgeLeft);
            if (markers.alternateMonth) classNames.push(styles.alternateMonth);
        }
        return classNames;
    };

    // Plain day numbers (FullCalendar would prefix the view's first cell with its
    // month); the 1st carries a small month label beside its number.
    const renderContinuousDayNumber = (dayInfo) => {
        const dayNumber = String(dayInfo.date.getDate());
        const monthLabel = getMonthStartLabel(formatCalendarCellDate(dayInfo.date));
        if (!monthLabel) return dayNumber;
        return (
            <span className={styles.monthStartNumber}>
                <span className={styles.monthStartLabel}>{monthLabel}</span>
                {dayNumber}
            </span>
        );
    };

    const blockLabelsByDate = React.useMemo(
        () => indexCalendarLabelsByDate([programLabels, blockLabels]),
        [blockLabels, programLabels],
    );
    const backgroundRanges = React.useMemo(() => buildBackgroundRanges(calendarEvents), [calendarEvents]);

    const syncBlockLabelForCell = React.useCallback((dayEl) => decorateCalendarCell(dayEl, {
        labelsByDate: blockLabelsByDate,
        backgroundRanges,
        dayStatesByDate,
        programDayRibbonDates,
        loadingMonths,
        selectedProgramName,
        multiSelect: Boolean(blockCreationMode),
        moveMode: dayMoveMode,
        selectableDateSet,
        selectedDate,
        selectedStatusDateSet,
        dragPreviewDates,
    }, CELL_CLASS_NAMES), [backgroundRanges, blockCreationMode, blockLabelsByDate, dayMoveMode, dayStatesByDate, dragPreviewDates, loadingMonths, programDayRibbonDates, selectableDateSet, selectedDate, selectedProgramName, selectedStatusDateSet]);

    const getBlockLabelFromEvent = (event) => {
        const labelElement = event.target?.closest?.('[data-program-block-label="true"]');
        if (!labelElement) return null;
        const labels = blockLabelsByDate.get(labelElement.dataset.programBlockLabelDate) || [];
        return labels[Number(labelElement.dataset.programBlockLabelIndex)] || null;
    };

    const stopBlockLabelPointerEvent = (event) => {
        if (getBlockLabelFromEvent(event)) event.stopPropagation();
    };

    const activateBlockLabel = (event) => {
        const blockLabel = getBlockLabelFromEvent(event);
        if (!blockLabel) return;
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        if (blockLabel.labelType === 'program') onProgramLabelClickRef.current?.(blockLabel);
        else onBlockLabelClickRef.current?.(blockLabel);
    };

    const activateSelectableDay = (event) => {
        const cell = event.target?.closest?.('[data-program-selectable-date]');
        if ((!blockCreationMode && !dayMoveMode) || !cell || cell !== event.target
            || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        event.stopPropagation();
        onDateClick?.({ dateStr: cell.dataset.programSelectableDate, jsEvent: event });
    };

    React.useEffect(() => {
        calendarContainerRef.current
            ?.querySelectorAll('.fc-daygrid-day[data-date]')
            .forEach(syncBlockLabelForCell);
    }, [syncBlockLabelForCell]);

    const handleDatesSet = (info) => {
        flushPendingScroll();
        if (!continuous && info?.view) {
            if (info.startStr && info.endStr) {
                reportVisibleRange({
                    start: info.startStr.slice(0, 10),
                    end: addDaysToDateString(info.endStr.slice(0, 10), -1),
                });
            }
            setMonthTitle(info.view.title || '');
            if (info.view.currentStart instanceof Date) {
                const month = `${formatCalendarCellDate(info.view.currentStart).slice(0, 7)}-01`;
                setVisibleMonth(month);
                onVisibleMonthChange?.(month);
            }
        }
        onDatesSet?.(info);
    };

    const handleContinuousToggle = (event) => {
        const enable = event.target.checked;
        if (enable) recenter();
        onContinuousChange?.(enable);
    };

    const handleTodayClick = () => {
        if (continuous) {
            navigateContinuousTo(formatCalendarCellDate(new Date()));
        } else {
            calendarRef.current?.getApi().today();
        }
        onTodayClick?.();
    };

    const handlePreviousClick = () => {
        if (continuous) {
            navigateContinuousTo(getMonthScrollTarget(shiftMonth(visibleMonth, -1)));
            return;
        }
        calendarRef.current?.getApi().prev();
    };

    const handleNextClick = () => {
        if (continuous) {
            navigateContinuousTo(getMonthScrollTarget(shiftMonth(visibleMonth, 1)));
            return;
        }
        calendarRef.current?.getApi().next();
    };

    const blockControls = showBlockControls && !readOnly ? (
        <ProgramCalendarBlockControls
            selectionModeButtonRef={selectionModeButtonRef}
            blockCreationMode={blockCreationMode}
            setBlockCreationMode={setBlockCreationMode}
            isMobile={isMobile}
            selectedRangeLabel={selectedRangeLabel}
            showAddBlockButton={showAddBlockButton}
            onAddBlockClick={onAddBlockClick}
        />
    ) : null;

    const usePageToolbar = !compact;
    const title = continuous ? formatMonthTitle(visibleMonth) : monthTitle;

    return (
        <div
            ref={calendarContainerRef}
            className={`${styles.calendarContainer} ${compact ? styles.calendarContainerCompact : ''} ${continuous ? styles.calendarContainerContinuous : ''} ${blockCreationMode ? styles.calendarContainerSelecting : ''}`}
            data-selection-mode={dayMoveMode ? 'move' : blockCreationMode ? 'multiple' : undefined}
            onClick={readOnly ? undefined : onCalendarBackgroundClick}
            onClickCapture={readOnly ? undefined : activateBlockLabel}
            onKeyDownCapture={readOnly ? undefined : (event) => { activateSelectableDay(event); activateBlockLabel(event); }}
            onPointerDownCapture={readOnly ? undefined : stopBlockLabelPointerEvent}
            onPointerUpCapture={readOnly ? undefined : stopBlockLabelPointerEvent}
            onMouseDownCapture={readOnly ? undefined : stopBlockLabelPointerEvent}
            onTouchStartCapture={readOnly ? undefined : stopBlockLabelPointerEvent}
            onTouchEndCapture={readOnly ? undefined : stopBlockLabelPointerEvent}
            {...dragSelection.handlers}
        >
            {usePageToolbar ? (
                <ProgramCalendarToolbar
                    title={title}
                    continuous={continuous}
                    onPrevious={handlePreviousClick}
                    onNext={handleNextClick}
                    onToday={handleTodayClick}
                    onContinuousToggle={onContinuousChange ? handleContinuousToggle : null}
                    actions={blockControls}
                />
            ) : null}

            {statusActions}

            <div className={styles.calendarBody}>
            <FullCalendar
                // Toggling continuous mode or shifting its window remounts the calendar
                // so its view and range start cleanly.
                key={calendarKey}
                ref={calendarRef}
                now={todayStr}
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView={continuousWindow ? CONTINUOUS_VIEW : 'dayGridMonth'}
                views={continuousWindow ? {
                    // A weeks duration (not visibleRange) keeps dayGrid breaking rows on weeks.
                    [CONTINUOUS_VIEW]: { type: 'dayGrid', duration: { weeks: continuousWindow.weeks } },
                } : undefined}
                firstDay={CONTINUOUS_FIRST_DAY}
                customButtons={{
                    contextualToday: {
                        text: 'Today',
                        click: handleTodayClick,
                    },
                }}
                headerToolbar={usePageToolbar
                    ? false
                    : { left: 'prev,next contextualToday', center: 'title', right: '' }}
                initialDate={continuousWindow ? continuousWindow.start : visibleMonth}
                events={calendarEvents}
                height={compact ? '100%' : (isMobile ? 560 : '100%')}
                expandRows={compact}
                dayMaxEvents={compact ? 3 : 5}
                eventOrder="sortOrder"
                // Multi-day mode owns click and drag through useCalendarDragSelection,
                // so FullCalendar's own selection, date clicks, and event clicks stand down.
                selectable={false}
                dateClick={readOnly || blockCreationMode ? undefined : onDateClick}
                eventClick={readOnly ? undefined : (info) => {
                    if (blockCreationMode) {
                        info.jsEvent?.preventDefault?.();
                        return;
                    }
                    onEventClick?.(info);
                }}
                eventContent={renderCalendarEventContent}
                datesSet={handleDatesSet}
                dayCellContent={continuous ? renderContinuousDayNumber : undefined}
                dayCellClassNames={readOnly && !continuous ? undefined : getDayCellClassNames}
                dayCellDidMount={(dayInfo) => syncBlockLabelForCell(dayInfo.el)}
                dayCellWillUnmount={(dayInfo) => clearCellDecoration(dayInfo.el, CELL_CLASS_NAMES)}
                droppable={Boolean(onGoalDueDrop) && !readOnly}
                drop={onGoalDueDrop ? (info) => {
                    const goalId = info.draggedEl?.dataset?.goalId;
                    if (goalId) onGoalDueDrop(goalId, info.dateStr);
                } : undefined}
            />
            </div>
            {/* The bulk status bar is fixed over the bottom of the viewport; this clearance
                lets the last week scroll above it instead of sitting unreachable beneath. */}
            {statusActions ? <div className={styles.bulkBarClearance} aria-hidden="true" /> : null}
        </div>
    );
}

export default ProgramCalendarView;
