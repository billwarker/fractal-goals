import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import useCalendarDragSelection from '../../hooks/useCalendarDragSelection';
import { addDaysToDateString } from '../../utils/dateUtils';
import { applyStreakDecoration, clearStreakDecoration } from '../../utils/programCalendarStreaks';
import {
    CONTINUOUS_FIRST_DAY,
    formatMonthTitle,
    getContinuousCellMarkers,
    canScrollWithin,
    getContinuousWindow,
    getMonthScrollTarget,
    getMonthStartLabel,
    getWeekRowMonth,
    shiftMonth,
} from '../../utils/programCalendarContinuous';
import { getProgramDayStateMeta, indexProgramDayStates } from '../../utils/programDayState';
import renderProgramCalendarEventContent from './ProgramCalendarEventContent';
import styles from './ProgramCalendarView.module.css';

const STREAK_CLASS_NAMES = { label: styles.streakLength, line: styles.streakLine, assistive: styles.dayStatusAssistive };
const CONTINUOUS_VIEW = 'dayGridContinuous';
// A row counts as "in view" once this much of it is below the scroller's top edge.
const TITLE_ROW_THRESHOLD = 24;
const MAX_READY_FRAMES = 30;
// Trailing delay before a scrolled viewport range is reported for data loading.
const VISIBLE_RANGE_SETTLE_MS = 120;

function prefersReducedMotion() {
    return typeof window !== 'undefined'
        && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

/** Run `callback(el)` once FullCalendar has rendered the element `find` looks for. */
function whenRendered(find, callback) {
    let frames = 0;
    let handle = null;
    const attempt = () => {
        const el = find();
        if (el) {
            callback(el);
            return;
        }
        frames += 1;
        if (frames < MAX_READY_FRAMES) handle = requestAnimationFrame(attempt);
    };
    attempt();
    return () => { if (handle !== null) cancelAnimationFrame(handle); };
}

function formatCalendarCellDate(date) {
    if (!(date instanceof Date)) {
        return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeCalendarEventDate(date) {
    if (typeof date === 'string') {
        return date.slice(0, 10);
    }
    return formatCalendarCellDate(date);
}

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
}) {
    const calendarRef = React.useRef(null);
    const calendarContainerRef = React.useRef(null);
    const initialDateStr = normalizeCalendarEventDate(initialDate) || formatCalendarCellDate(new Date());
    // `YYYY-MM-01` of the month in view: month mode reads it from FullCalendar,
    // continuous mode from the week row at the top of the scroller.
    const [visibleMonth, setVisibleMonth] = React.useState(() => `${initialDateStr.slice(0, 7)}-01`);
    const [monthTitle, setMonthTitle] = React.useState('');
    // Continuous mode shows a year centred on today; a context date or navigation
    // target beyond it re-centres the year there.
    const [windowAnchor, setWindowAnchor] = React.useState(() => initialDateStr);
    const pendingScrollRef = React.useRef(continuous ? { date: initialDateStr, smooth: false } : null);
    const continuousWindow = React.useMemo(
        () => (continuous ? getContinuousWindow(windowAnchor) : null),
        [continuous, windowAnchor],
    );
    const calendarKey = continuousWindow ? `continuous:${continuousWindow.start}:${continuousWindow.weeks}` : 'month';
    const getScroller = React.useCallback(
        () => {
            const dayGrid = calendarContainerRef.current?.querySelector('.fc-daygrid-body');
            return dayGrid?.closest('.fc-scroller')
                || calendarContainerRef.current?.querySelector('.fc-scrollgrid-section-body .fc-scroller')
                || null;
        },
        [],
    );
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
    ), [dayStatesByDate, readOnly]);

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

    const blockLabelsByDate = React.useMemo(() => {
        const labels = new Map();
        [...programLabels, ...blockLabels].forEach((label) => {
            if (!label?.date) return;
            const dateLabels = labels.get(label.date) || [];
            dateLabels.push({
                title: label.title,
                date: label.date,
                color: label.color || 'var(--color-text-primary)',
                startDate: label.startDate || label.date,
                endDate: label.endDate || label.date,
                programId: label.programId,
                blockId: label.blockId,
                labelType: label.labelType || 'block',
                weekChip: label.weekChip || null,
                weekTitle: label.weekTitle || null,
            });
            labels.set(label.date, dateLabels);
        });
        return labels;
    }, [blockLabels, programLabels]);

    const backgroundRanges = React.useMemo(() => {
        return (calendarEvents || [])
            .filter((event) => event?.display === 'background')
            .map((event) => {
                const eventType = event.extendedProps?.type;
                if (eventType !== 'program_background' && eventType !== 'block_background') {
                    return null;
                }

                const start = normalizeCalendarEventDate(event.start);
                const end = normalizeCalendarEventDate(event.end);
                if (!start || !end) return null;

                return {
                    start,
                    end,
                    color: event.backgroundColor || event.borderColor || 'var(--color-brand-primary)',
                    sortOrder: event.extendedProps?.sortOrder ?? (eventType === 'block_background' ? -10 : -20),
                    type: eventType,
                };
            })
            .filter(Boolean);
    }, [calendarEvents]);

    const getCellBackgrounds = React.useCallback((dateStr) => {
        const selectedRanges = {
            program: null,
            block: null,
        };

        backgroundRanges.forEach((range) => {
            if (dateStr < range.start || dateStr >= range.end) return;

            const key = range.type === 'block_background' ? 'block' : 'program';
            if (!selectedRanges[key] || range.sortOrder >= selectedRanges[key].sortOrder) {
                selectedRanges[key] = range;
            }
        });

        return selectedRanges;
    }, [backgroundRanges]);

    const syncBlockLabelForCell = React.useCallback((dayEl) => {
        const dateStr = dayEl.getAttribute('data-date');
        if (!dateStr) return;

        const cellLabels = blockLabelsByDate.get(dateStr) || [];
        const frame = dayEl.querySelector('.fc-daygrid-day-frame');

        if (!frame) return;

        dayEl.style.removeProperty('--program-calendar-cell-color');
        dayEl.removeAttribute('data-calendar-background');
        dayEl.removeAttribute('data-day-state');
        dayEl.removeAttribute('aria-selected');
        dayEl.removeAttribute('aria-label');
        dayEl.removeAttribute('tabindex');
        dayEl.removeAttribute('data-program-selectable-date');
        frame.querySelectorAll(`[data-program-block-label], .${styles.blockCellLabel}`)
            .forEach((label) => label.remove());
        frame.querySelectorAll('[data-program-cell-assistive]').forEach((status) => status.remove());
        clearStreakDecoration(dayEl, frame);
        if (loadingMonths?.has(dateStr.slice(0, 7))) dayEl.setAttribute('data-loading', 'true');
        else dayEl.removeAttribute('data-loading');
        frame.removeAttribute('data-block-label');
        frame.style.removeProperty('--program-block-label-color');

        const cellBackgrounds = getCellBackgrounds(dateStr);
        const effectiveBackground = cellBackgrounds.block || cellBackgrounds.program;
        if (effectiveBackground) {
            dayEl.style.setProperty('--program-calendar-cell-color', effectiveBackground.color);
            dayEl.setAttribute('data-calendar-background', cellBackgrounds.block ? 'block' : 'program');
        }

        const dayState = dayStatesByDate.get(dateStr);
        const stateMeta = getProgramDayStateMeta(dayState?.state);
        if (dayState && stateMeta) {
            dayEl.setAttribute('data-day-state', dayState.state);
            const usesRibbon = programDayRibbonDates.has(dateStr);
            if (!usesRibbon) {
                const status = document.createElement('span');
                status.className = styles.dayStatusAssistive;
                status.textContent = `${selectedProgramName || 'Selected program'}: ${stateMeta.label}`;
                // Only nodes this decorator injected carry this attribute; React-owned
                // ribbon content (e.g. ProgramDayStatusMark) must never be removed here.
                status.setAttribute('data-program-cell-assistive', 'true');
                frame.appendChild(status);
            }
        }

        applyStreakDecoration(dayEl, frame, dayState, STREAK_CLASS_NAMES);

        if ((blockCreationMode || dayMoveMode) && selectableDateSet.has(dateStr)) {
            const selected = dayMoveMode ? selectedDate === dateStr : selectedStatusDateSet.has(dateStr) || dragPreviewDates.has(dateStr);
            dayEl.setAttribute('aria-selected', selected ? 'true' : 'false');
            dayEl.setAttribute('aria-label', dayMoveMode ? `Move destination ${dateStr}, ${selected ? 'selected' : 'not selected'}` : `${dateStr}, ${dayState?.scheduled ? 'scheduled program day' : 'program date'}, ${selected ? 'selected' : 'not selected'}`);
            dayEl.setAttribute('tabindex', '0');
            dayEl.setAttribute('data-program-selectable-date', dateStr);
        }

        cellLabels.forEach((blockLabel, index) => {
            if (blockLabel.labelType === 'week') {
                // Decorative: the week also shows in the day pane, so screen readers get the
                // full sentence once and the visible chip stays hidden from them.
                const weekLabel = document.createElement('span');
                weekLabel.className = `${styles.blockCellLabel} ${styles.weekCellLabel}`;
                weekLabel.title = blockLabel.weekTitle;
                weekLabel.setAttribute('data-program-block-label', 'week');
                weekLabel.style.setProperty('--program-block-label-color', blockLabel.color);
                weekLabel.style.setProperty('--program-label-offset', `${index * 16}px`);
                const chip = document.createElement('span');
                chip.className = styles.weekChip;
                chip.textContent = blockLabel.title;
                chip.setAttribute('aria-hidden', 'true');
                const assistive = document.createElement('span');
                assistive.className = styles.dayStatusAssistive;
                assistive.textContent = blockLabel.weekTitle;
                weekLabel.append(chip, assistive);
                frame.appendChild(weekLabel);
                return;
            }
            const labelButton = document.createElement('button');
            labelButton.type = 'button';
            labelButton.className = styles.blockCellLabel;
            if (blockLabel.labelType === 'program') labelButton.classList.add(styles.programCellLabel);
            labelButton.textContent = blockLabel.title;
            labelButton.title = blockLabel.weekTitle || blockLabel.title;
            if (blockLabel.weekChip) {
                labelButton.classList.add(styles.blockCellLabelWithWeek);
                const chip = document.createElement('span');
                chip.className = styles.weekChip;
                chip.textContent = blockLabel.weekChip;
                chip.setAttribute('aria-hidden', 'true');
                const name = document.createElement('span');
                name.className = styles.blockCellLabelName;
                name.textContent = blockLabel.title;
                labelButton.replaceChildren(chip, name);
            }
            labelButton.setAttribute('aria-label', blockLabel.labelType === 'program'
                ? `View ${blockLabel.title}`
                : `Select ${blockLabel.title}`);
            labelButton.setAttribute('data-program-block-label', 'true');
            labelButton.setAttribute('data-program-block-label-date', dateStr);
            labelButton.setAttribute('data-program-block-label-index', String(index));
            labelButton.style.setProperty('--program-block-label-color', blockLabel.color);
            labelButton.style.setProperty('--program-label-offset', `${index * 16}px`);
            frame.appendChild(labelButton);
        });
    }, [blockCreationMode, dayMoveMode, selectedDate, blockLabelsByDate, dayStatesByDate, dragPreviewDates, getCellBackgrounds, loadingMonths, programDayRibbonDates, selectableDateSet, selectedProgramName, selectedStatusDateSet]);

    const clearBlockLabelForCell = (dayEl) => {
        const frame = dayEl.querySelector('.fc-daygrid-day-frame');
        dayEl.style.removeProperty('--program-calendar-cell-color');
        dayEl.removeAttribute('data-calendar-background');
        dayEl.removeAttribute('data-day-state');
        dayEl.removeAttribute('aria-selected');
        dayEl.removeAttribute('aria-label');
        dayEl.removeAttribute('tabindex');
        dayEl.removeAttribute('data-program-selectable-date');
        dayEl.removeAttribute('data-loading');
        frame?.querySelectorAll(`[data-program-block-label], .${styles.blockCellLabel}`)
            .forEach((label) => label.remove());
        frame?.querySelectorAll('[data-program-cell-assistive]').forEach((status) => status.remove());
        clearStreakDecoration(dayEl, frame);
    };

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

    const scrollToDate = React.useCallback((dateStr, { smooth = true } = {}) => {
        const row = calendarContainerRef.current
            ?.querySelector(`.fc-daygrid-day[data-date="${dateStr}"]`)
            ?.closest('tr');
        const scroller = row?.closest('.fc-scroller') || getScroller();
        if (!scroller || !row) return false;
        const top = scroller.scrollTop + row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        if (typeof scroller.scrollTo === 'function') {
            scroller.scrollTo({ top, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
        } else {
            scroller.scrollTop = top;
        }
        return true;
    }, [getScroller]);

    /** Scroll to a date, re-centring (and remounting) the window when it cannot reach it. */
    const navigateContinuousTo = (dateStr) => {
        if (canScrollWithin(dateStr, continuousWindow)) {
            scrollToDate(dateStr);
            return;
        }
        pendingScrollRef.current = { date: dateStr, smooth: false };
        setWindowAnchor(dateStr);
    };

    const onVisibleRangeChangeRef = React.useRef(onVisibleRangeChange);
    onVisibleRangeChangeRef.current = onVisibleRangeChange;
    const reportedRangeRef = React.useRef('');
    const reportVisibleRange = React.useCallback((range) => {
        const key = range ? `${range.start}:${range.end}` : '';
        if (!range || key === reportedRangeRef.current) return;
        reportedRangeRef.current = key;
        onVisibleRangeChangeRef.current?.(range);
    }, []);

    // Continuous mode: the month title follows the week row at the top of the
    // scroller, and the rows actually on screen (top to bottom) drive data loading.
    React.useEffect(() => {
        if (!continuous) return undefined;
        let scroller = null;
        let frame = null;
        let initialScrollFrame = null;
        let settleTimer = null;
        const rowDates = (row) => [...(row?.querySelectorAll('.fc-daygrid-day[data-date]') || [])]
            .map((cell) => cell.getAttribute('data-date'));
        const syncTitle = () => {
            frame = null;
            if (!scroller) return;
            const bounds = scroller.getBoundingClientRect();
            const top = bounds.top + TITLE_ROW_THRESHOLD;
            const rows = [...scroller.querySelectorAll('.fc-daygrid-body tr')];
            const row = rows.find((candidate) => candidate.getBoundingClientRect().bottom > top);
            const month = getWeekRowMonth(rowDates(row));
            if (month) {
                setVisibleMonth((current) => (current === month ? current : month));
                onVisibleMonthChange?.(month);
            }
            const visibleRows = rows.filter((candidate) => {
                const rect = candidate.getBoundingClientRect();
                return rect.bottom > bounds.top && rect.top < bounds.bottom;
            });
            const firstDates = rowDates(visibleRows[0]).sort();
            const lastDates = rowDates(visibleRows[visibleRows.length - 1]).sort();
            if (firstDates.length && lastDates.length) {
                const range = { start: firstDates[0], end: lastDates[lastDates.length - 1] };
                if (settleTimer !== null) window.clearTimeout(settleTimer);
                settleTimer = window.setTimeout(() => {
                    settleTimer = null;
                    reportVisibleRange(range);
                }, reportedRangeRef.current ? VISIBLE_RANGE_SETTLE_MS : 0);
            }
        };
        const onScroll = () => {
            if (frame === null) frame = requestAnimationFrame(syncTitle);
        };
        const findReadyScroller = () => {
            const el = getScroller();
            const pendingDate = pendingScrollRef.current?.date;
            if (!el || (pendingDate && !calendarContainerRef.current?.querySelector(
                `.fc-daygrid-day[data-date="${pendingDate}"]`,
            ))) return null;
            return el;
        };
        const cancelReady = whenRendered(findReadyScroller, (el) => {
            scroller = el;
            const pending = pendingScrollRef.current;
            scroller.addEventListener('scroll', onScroll, { passive: true });
            if (pending) {
                // Anchor to the actual scroller containing the target row after
                // FullCalendar finishes laying out the complete week grid.
                initialScrollFrame = requestAnimationFrame(() => {
                    initialScrollFrame = requestAnimationFrame(() => {
                        initialScrollFrame = null;
                        if (scrollToDate(pending.date, { smooth: pending.smooth })) {
                            pendingScrollRef.current = null;
                        }
                        syncTitle();
                    });
                });
            } else {
                syncTitle();
            }
        });
        return () => {
            cancelReady();
            if (frame !== null) cancelAnimationFrame(frame);
            if (initialScrollFrame !== null) cancelAnimationFrame(initialScrollFrame);
            if (settleTimer !== null) window.clearTimeout(settleTimer);
            scroller?.removeEventListener('scroll', onScroll);
        };
    }, [calendarKey, continuous, getScroller, onVisibleMonthChange, reportVisibleRange, scrollToDate]);

    const handleDatesSet = (info) => {
        if (continuous && pendingScrollRef.current) {
            const pending = pendingScrollRef.current;
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (pendingScrollRef.current !== pending) return;
                if (scrollToDate(pending.date, { smooth: pending.smooth })) {
                    pendingScrollRef.current = null;
                }
            }));
        }
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
        if (enable) {
            pendingScrollRef.current = { date: initialDateStr, smooth: false };
            setWindowAnchor(initialDateStr);
        }
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
        <div className={styles.headerActions}>
            <button
                type="button"
                ref={selectionModeButtonRef}
                onClick={() => setBlockCreationMode(!blockCreationMode)}
                className={`${styles.customBtn} ${styles.createModeBtn} ${blockCreationMode ? styles.createModeBtnActive : ''}`}
                aria-pressed={blockCreationMode}
            >
                {blockCreationMode ? 'Selecting Multiple Days' : (isMobile ? 'Select Days' : 'Select Multiple Days')}
            </button>
            {selectedRangeLabel ? (
                <span className={styles.selectionLabel}>{selectedRangeLabel}</span>
            ) : null}
            {showAddBlockButton ? (
                <button
                    type="button"
                    onClick={onAddBlockClick}
                    className={`${styles.customBtn} ${styles.addBlockBtn}`}
                >
                    + Add Block
                </button>
            ) : null}
        </div>
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
                <div className={styles.pageToolbar}>
                    <div className={styles.toolbarNavigation} aria-label="Calendar navigation" role="group">
                        <button
                            type="button"
                            className={styles.toolbarButton}
                            aria-label="Previous month"
                            onClick={handlePreviousClick}
                        >
                            ‹
                        </button>
                        <button
                            type="button"
                            className={styles.toolbarButton}
                            aria-label="Next month"
                            onClick={handleNextClick}
                        >
                            ›
                        </button>
                        <button type="button" className={styles.toolbarButton} onClick={handleTodayClick}>
                            Today
                        </button>
                        {onContinuousChange ? (
                            <label className={styles.continuousToggle}>
                                <input
                                    type="checkbox"
                                    checked={continuous}
                                    onChange={handleContinuousToggle}
                                />
                                <span>Continuous</span>
                            </label>
                        ) : null}
                    </div>
                    <h2 className={styles.toolbarTitle} aria-live="polite">{title}</h2>
                    {blockControls}
                </div>
            ) : null}

            {statusActions}

            <div className={styles.calendarBody}>
            <FullCalendar
                // Toggling continuous mode or shifting its window remounts the calendar
                // so its view and range start cleanly.
                key={calendarKey}
                ref={calendarRef}
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
                dayCellWillUnmount={(dayInfo) => clearBlockLabelForCell(dayInfo.el)}
            />
            </div>
        </div>
    );
}

export default ProgramCalendarView;
