import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import GoalIcon from '../atoms/GoalIcon';
import { getProgramDayStateMeta, indexProgramDayStates } from '../../utils/programDayState';
import ProgramDayCompletionMark from './ProgramDayCompletionMark';
import styles from './ProgramCalendarView.module.css';

function activateGoalEvent(eventInfo, onGoalActivate, jsEvent) {
    if (!onGoalActivate) return;

    jsEvent.preventDefault();
    jsEvent.stopPropagation();
    onGoalActivate({
        ...eventInfo,
        jsEvent: jsEvent.nativeEvent || jsEvent,
    });
}

function renderEventContent(eventInfo, onGoalActivate, dayState) {
    const { type, blockColor, isCompleted, goalIcon } = eventInfo.event.extendedProps;

    // Block backgrounds render through FullCalendar background styling.
    if (type === 'block_background') return null;

    const title = eventInfo.event.title;

    // Goal events use their configured color without a filled banner.
    if (type === 'goal') {
        return (
            <div
                className={`${styles.eventPill} ${styles.eventPillGoal}`}
                style={{ background: 'transparent' }}
                role={onGoalActivate ? 'button' : undefined}
                tabIndex={onGoalActivate ? 0 : undefined}
                aria-label={onGoalActivate ? `Open goal: ${title}` : undefined}
                onClickCapture={onGoalActivate
                    ? (event) => activateGoalEvent(eventInfo, onGoalActivate, event)
                    : undefined}
                onKeyDownCapture={onGoalActivate
                    ? (event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        activateGoalEvent(eventInfo, onGoalActivate, event);
                    }
                    : undefined}
            >
                {goalIcon ? (
                    <span className={styles.eventGoalIcon} aria-hidden="true">
                        <GoalIcon
                            shape={goalIcon.shape}
                            color={goalIcon.color}
                            secondaryColor={goalIcon.secondaryColor}
                            isSmart={goalIcon.isSmart}
                            size={13}
                        />
                    </span>
                ) : null}
                <span className={styles.eventPillText}>{title}</span>
            </div>
        );
    }

    if (type === 'program_day') {
        const color = blockColor || 'var(--color-brand-primary)';
        const bg = `color-mix(in srgb, ${color} 13%, var(--color-bg-card))`;
        const showCompletionMark = Boolean(isCompleted || dayState?.closed);
        return (
            <div
                className={`${styles.eventPill} ${styles.eventPillProgramDay}`}
                style={{ '--program-day-pill-bg': bg }}
            >
                <span className={styles.eventPillText}>{title}</span>
                {showCompletionMark ? (
                    <ProgramDayCompletionMark
                        complete={Boolean(isCompleted)}
                        label={`${title}: ${isCompleted ? 'requirements met' : 'missed'}`}
                        size="sm"
                    />
                ) : null}
            </div>
        );
    }

    if (type === 'template') {
        return (
            <div className={`${styles.eventPill} ${isCompleted ? styles.eventPillTemplateCompleted : styles.eventPillTemplate}`}>
                <span className={styles.eventPillText}>{title}</span>
            </div>
        );
    }

    if (type === 'session') {
        return (
            <div className={`${styles.eventPill} ${isCompleted ? styles.eventPillSessionCompleted : styles.eventPillSession}`}>
                <span className={styles.eventPillText}>{title}</span>
            </div>
        );
    }

    // Fallback
    return (
        <div className={styles.eventPill}>
            <span className={styles.eventPillText}>{title}</span>
        </div>
    );
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
    selectedDate,
    selectedRange,
    selectedRangeLabel,
    showAddBlockButton = true,
    onCalendarBackgroundClick,
    onTodayClick,
    onBlockLabelClick,
    compact = false,
    readOnly = false,
    dayStates = [],
    selectedProgramName = '',
    selectedProgramId = null,
}) {
    const calendarRef = React.useRef(null);
    const calendarContainerRef = React.useRef(null);
    const onEventClickRef = React.useRef(onEventClick);
    const onBlockLabelClickRef = React.useRef(onBlockLabelClick);
    onEventClickRef.current = onEventClick;
    onBlockLabelClickRef.current = onBlockLabelClick;
    const dayStatesByDate = React.useMemo(() => indexProgramDayStates(dayStates), [dayStates]);
    const programDayRibbonDates = React.useMemo(() => new Set(
        (calendarEvents || [])
            .filter((event) => event.extendedProps?.type === 'program_day'
                && (!selectedProgramId || String(event.extendedProps?.programId) === String(selectedProgramId)))
            .map((event) => normalizeCalendarEventDate(event.start)),
    ), [calendarEvents, selectedProgramId]);

    const renderCalendarEventContent = React.useCallback((eventInfo) => renderEventContent(
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
        return classNames;
    };

    const blockLabelsByDate = React.useMemo(() => {
        const labels = new Map();
        blockLabels.forEach((label) => {
            if (!label?.date) return;
            labels.set(label.date, {
                title: label.title,
                color: label.color || 'var(--color-text-primary)',
                startDate: label.startDate || label.date,
                endDate: label.endDate || label.date,
                programId: label.programId,
                blockId: label.blockId,
            });
        });
        return labels;
    }, [blockLabels]);

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

        const blockLabel = blockLabelsByDate.get(dateStr);
        const frame = dayEl.querySelector('.fc-daygrid-day-frame');

        if (!frame) return;

        dayEl.style.removeProperty('--program-calendar-cell-color');
        dayEl.removeAttribute('data-calendar-background');
        dayEl.removeAttribute('data-day-state');
        frame.querySelectorAll(`[data-program-block-label], .${styles.blockCellLabel}`)
            .forEach((label) => label.remove());
        frame.querySelectorAll('[data-program-day-status]').forEach((status) => status.remove());
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
                status.setAttribute('data-program-day-status', 'true');
                frame.appendChild(status);
            }
        }

        if (blockLabel) {
            const labelButton = document.createElement('button');
            labelButton.type = 'button';
            labelButton.className = styles.blockCellLabel;
            labelButton.textContent = blockLabel.title;
            labelButton.title = blockLabel.title;
            labelButton.setAttribute('aria-label', `Select ${blockLabel.title}`);
            labelButton.setAttribute('data-program-block-label', 'true');
            labelButton.setAttribute('data-program-block-label-date', dateStr);
            labelButton.style.setProperty('--program-block-label-color', blockLabel.color);
            frame.appendChild(labelButton);
        }
    }, [blockLabelsByDate, dayStatesByDate, getCellBackgrounds, programDayRibbonDates, selectedProgramName]);

    const clearBlockLabelForCell = (dayEl) => {
        const frame = dayEl.querySelector('.fc-daygrid-day-frame');
        dayEl.style.removeProperty('--program-calendar-cell-color');
        dayEl.removeAttribute('data-calendar-background');
        dayEl.removeAttribute('data-day-state');
        frame?.querySelectorAll(`[data-program-block-label], .${styles.blockCellLabel}`)
            .forEach((label) => label.remove());
        frame?.querySelectorAll('[data-program-day-status]').forEach((status) => status.remove());
    };

    const getBlockLabelFromEvent = (event) => {
        const labelElement = event.target?.closest?.('[data-program-block-label]');
        if (!labelElement) return null;
        return blockLabelsByDate.get(labelElement.dataset.programBlockLabelDate) || null;
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
        onBlockLabelClickRef.current?.(blockLabel);
    };

    React.useEffect(() => {
        calendarContainerRef.current
            ?.querySelectorAll('.fc-daygrid-day[data-date]')
            .forEach(syncBlockLabelForCell);
    }, [syncBlockLabelForCell]);

    const handleTodayClick = () => {
        calendarRef.current?.getApi().today();
        onTodayClick?.();
    };

    const handlePreviousClick = () => {
        calendarRef.current?.getApi().prev();
    };

    const handleNextClick = () => {
        calendarRef.current?.getApi().next();
    };

    const blockControls = showBlockControls && !readOnly ? (
        <div className={styles.headerActions}>
            <button
                type="button"
                onClick={() => setBlockCreationMode(!blockCreationMode)}
                className={`${styles.customBtn} ${styles.createModeBtn} ${blockCreationMode ? styles.createModeBtnActive : ''}`}
            >
                {blockCreationMode ? 'Multi-Day Select On' : (isMobile ? 'Select Days' : 'Select Multiple Days')}
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

    const useMobileToolbar = isMobile && !compact;

    return (
        <div
            ref={calendarContainerRef}
            className={`${styles.calendarContainer} ${compact ? styles.calendarContainerCompact : ''} ${useMobileToolbar ? styles.calendarContainerMobileToolbar : ''} ${blockCreationMode ? styles.calendarContainerSelecting : ''}`}
            data-selection-mode={blockCreationMode ? 'multiple' : undefined}
            onClick={readOnly ? undefined : onCalendarBackgroundClick}
            onClickCapture={readOnly ? undefined : activateBlockLabel}
            onKeyDownCapture={readOnly ? undefined : activateBlockLabel}
            onPointerDownCapture={readOnly ? undefined : stopBlockLabelPointerEvent}
            onPointerUpCapture={readOnly ? undefined : stopBlockLabelPointerEvent}
            onTouchStartCapture={readOnly ? undefined : stopBlockLabelPointerEvent}
            onTouchEndCapture={readOnly ? undefined : stopBlockLabelPointerEvent}
        >
            {useMobileToolbar ? (
                <div className={styles.mobileControlRow}>
                    <div className={styles.mobileNavigation} aria-label="Calendar navigation">
                        <button
                            type="button"
                            className={styles.mobileNavButton}
                            aria-label="Previous month"
                            onClick={handlePreviousClick}
                        >
                            ‹
                        </button>
                        <button
                            type="button"
                            className={styles.mobileNavButton}
                            aria-label="Next month"
                            onClick={handleNextClick}
                        >
                            ›
                        </button>
                        <button type="button" className={styles.mobileNavButton} onClick={handleTodayClick}>
                            Today
                        </button>
                    </div>
                    {blockControls}
                </div>
            ) : blockControls}

            <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                customButtons={{
                    contextualToday: {
                        text: 'Today',
                        click: handleTodayClick,
                    },
                }}
                headerToolbar={useMobileToolbar
                    ? { left: '', center: 'title', right: '' }
                    : { left: 'prev,next contextualToday', center: 'title', right: '' }}
                initialDate={initialDate}
                events={calendarEvents}
                height={compact ? '100%' : (isMobile ? 560 : '100%')}
                expandRows={compact}
                dayMaxEvents={compact ? 3 : 5}
                eventOrder="sortOrder"
                selectable={!readOnly && blockCreationMode}
                selectMinDistance={5}
                select={readOnly ? undefined : onDateSelect}
                dateClick={readOnly ? undefined : onDateClick}
                eventClick={readOnly ? undefined : onEventClick}
                eventContent={renderCalendarEventContent}
                datesSet={onDatesSet}
                dayCellClassNames={readOnly ? undefined : getDayCellClassNames}
                dayCellDidMount={(dayInfo) => syncBlockLabelForCell(dayInfo.el)}
                dayCellWillUnmount={(dayInfo) => clearBlockLabelForCell(dayInfo.el)}
            />
        </div>
    );
}

export default ProgramCalendarView;
