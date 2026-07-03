import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import styles from './ProgramCalendarView.module.css';

function renderEventContent(eventInfo) {
    const { type, blockColor, isCompleted } = eventInfo.event.extendedProps;

    // Block backgrounds render through FullCalendar background styling.
    if (type === 'block_background') return null;

    const title = eventInfo.event.title;

    // Goal events: use dynamic goal colors on the pill itself
    if (type === 'goal') {
        const bg = eventInfo.event.backgroundColor;
        const fg = eventInfo.event.textColor;
        return (
            <div
                className={`${styles.eventPill} ${styles.eventPillGoal}`}
                style={{ background: bg, color: fg }}
            >
                <span className={styles.eventPillText}>{title}</span>
            </div>
        );
    }

    if (type === 'program_day') {
        const bg = isCompleted
            ? 'color-mix(in srgb, var(--color-brand-success) 13%, var(--color-bg-card))'
            : `color-mix(in srgb, ${blockColor || 'var(--color-brand-primary)'} 13%, var(--color-bg-card))`;
        return (
            <div
                className={`${styles.eventPill} ${styles.eventPillProgramDay}`}
                style={{ background: bg }}
            >
                <span className={styles.eventPillText}>{title}</span>
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
}) {
    const calendarRef = React.useRef(null);
    const calendarContainerRef = React.useRef(null);

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

    const compactBackgroundRanges = React.useMemo(() => {
        if (!compact) return [];

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
    }, [calendarEvents, compact]);

    const getCompactCellBackgrounds = React.useCallback((dateStr) => {
        const selectedRanges = {
            program: null,
            block: null,
        };

        compactBackgroundRanges.forEach((range) => {
            if (dateStr < range.start || dateStr >= range.end) return;

            const key = range.type === 'block_background' ? 'block' : 'program';
            if (!selectedRanges[key] || range.sortOrder >= selectedRanges[key].sortOrder) {
                selectedRanges[key] = range;
            }
        });

        return selectedRanges;
    }, [compactBackgroundRanges]);

    const syncBlockLabelForCell = React.useCallback((dayEl) => {
        const dateStr = dayEl.getAttribute('data-date');
        if (!dateStr) return;

        const blockLabel = blockLabelsByDate.get(dateStr);
        const frame = dayEl.querySelector('.fc-daygrid-day-frame');

        if (!frame) return;

        dayEl.classList.remove(styles.compactProgramCell, styles.compactBlockCell);
        dayEl.style.removeProperty('--program-compact-program-bg');
        dayEl.style.removeProperty('--program-compact-block-bg');
        frame.querySelector(`.${styles.blockCellLabel}`)?.remove();
        frame.removeAttribute('data-block-label');
        frame.style.removeProperty('--program-block-label-color');

        if (compact) {
            const cellBackgrounds = getCompactCellBackgrounds(dateStr);
            if (cellBackgrounds.program) {
                dayEl.classList.add(styles.compactProgramCell);
                dayEl.style.setProperty('--program-compact-program-bg', cellBackgrounds.program.color);
            }
            if (cellBackgrounds.block) {
                dayEl.classList.add(styles.compactBlockCell);
                dayEl.style.setProperty('--program-compact-block-bg', cellBackgrounds.block.color);
            }
        }

        if (blockLabel) {
            const labelButton = document.createElement('button');
            labelButton.type = 'button';
            labelButton.className = styles.blockCellLabel;
            labelButton.textContent = blockLabel.title;
            labelButton.title = blockLabel.title;
            labelButton.setAttribute('aria-label', `Select ${blockLabel.title}`);
            labelButton.style.setProperty('--program-block-label-color', blockLabel.color);
            ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach((eventName) => {
                labelButton.addEventListener(eventName, (event) => {
                    event.stopPropagation();
                });
            });
            labelButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                onBlockLabelClick?.(blockLabel);
            });
            labelButton.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                onBlockLabelClick?.(blockLabel);
            });
            frame.appendChild(labelButton);
        }
    }, [blockLabelsByDate, compact, getCompactCellBackgrounds, onBlockLabelClick]);

    const clearBlockLabelForCell = (dayEl) => {
        const frame = dayEl.querySelector('.fc-daygrid-day-frame');
        dayEl.classList.remove(styles.compactProgramCell, styles.compactBlockCell);
        dayEl.style.removeProperty('--program-compact-program-bg');
        dayEl.style.removeProperty('--program-compact-block-bg');
        frame?.querySelector(`.${styles.blockCellLabel}`)?.remove();
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

    return (
        <div
            ref={calendarContainerRef}
            className={`${styles.calendarContainer} ${compact ? styles.calendarContainerCompact : ''}`}
            onClick={readOnly ? undefined : onCalendarBackgroundClick}
        >
            {/* Block creation controls - positioned at top right of calendar area */}
            {showBlockControls && !readOnly ? (
                <div className={styles.headerActions}>
                    <button
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
                            onClick={onAddBlockClick}
                            className={`${styles.customBtn} ${styles.addBlockBtn}`}
                        >
                            + Add Block
                        </button>
                    ) : null}
                </div>
            ) : null}

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
                headerToolbar={{ left: 'prev,next contextualToday', center: 'title', right: '' }}
                initialDate={initialDate}
                events={calendarEvents}
                height={compact ? '100%' : (isMobile ? 560 : '100%')}
                expandRows={compact}
                dayMaxEvents={compact ? 3 : 5}
                eventOrder="sortOrder"
                selectable={!readOnly && blockCreationMode}
                select={readOnly ? undefined : onDateSelect}
                dateClick={readOnly ? undefined : onDateClick}
                eventClick={readOnly ? undefined : onEventClick}
                eventContent={renderEventContent}
                datesSet={onDatesSet}
                dayCellClassNames={readOnly ? undefined : getDayCellClassNames}
                dayCellDidMount={(dayInfo) => syncBlockLabelForCell(dayInfo.el)}
                dayCellWillUnmount={(dayInfo) => clearBlockLabelForCell(dayInfo.el)}
            />
        </div>
    );
}

export default ProgramCalendarView;
