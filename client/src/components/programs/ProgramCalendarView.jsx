import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import styles from './ProgramCalendarView.module.css';

function renderEventContent(eventInfo) {
    const { type, blockColor, isCompleted } = eventInfo.event.extendedProps;

    // Block background events render themselves — skip custom content
    if (type === 'block_background') return null;

    const title = eventInfo.event.title;

    // Goal events: use dynamic goal colors on the pill itself
    if (type === 'goal') {
        const bg = eventInfo.event.backgroundColor;
        const fg = eventInfo.event.textColor;
        return (
            <div
                className={`${styles.eventPill} ${styles.eventPillGoal}`}
                style={{ background: bg, color: fg, borderLeftColor: bg }}
            >
                <span className={styles.eventPillText}>{title}</span>
            </div>
        );
    }

    if (type === 'program_day') {
        const accentColor = isCompleted ? 'var(--color-brand-success)' : (blockColor || 'var(--color-brand-primary)');
        const bg = isCompleted
            ? 'color-mix(in srgb, var(--color-brand-success) 13%, var(--color-bg-card))'
            : `color-mix(in srgb, ${blockColor || 'var(--color-brand-primary)'} 13%, var(--color-bg-card))`;
        return (
            <div
                className={`${styles.eventPill} ${styles.eventPillProgramDay}`}
                style={{ borderLeftColor: accentColor, background: bg }}
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

function ProgramCalendarView({
    calendarEvents,
    blockCreationMode,
    setBlockCreationMode,
    onAddBlockClick,
    onDateSelect,
    onDateClick,
    onEventClick,
    isMobile = false
}) {
    return (
        <div className={styles.calendarContainer}>
            {/* Block creation controls - positioned at top right of calendar area */}
            <div className={styles.headerActions}>
                <button
                    onClick={() => setBlockCreationMode(!blockCreationMode)}
                    className={`${styles.customBtn} ${styles.createModeBtn} ${blockCreationMode ? styles.createModeBtnActive : ''}`}
                >
                    {blockCreationMode ? '✓ Add Mode On' : (isMobile ? 'Add by Date' : 'Select Dates to Add Block')}
                </button>
                <button
                    onClick={onAddBlockClick}
                    className={`${styles.customBtn} ${styles.addBlockBtn}`}
                >
                    + Add Block
                </button>
            </div>

            <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
                initialDate={new Date()}
                events={calendarEvents}
                height={isMobile ? 560 : '100%'}
                dayMaxEvents={5}
                eventOrder="sortOrder"
                selectable={true}
                select={onDateSelect}
                dateClick={onDateClick}
                eventClick={onEventClick}
                eventContent={renderEventContent}
            />
        </div>
    );
}

export default ProgramCalendarView;
