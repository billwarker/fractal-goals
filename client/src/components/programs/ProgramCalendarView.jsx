import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import styles from './ProgramCalendarView.module.css';

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
            />
        </div>
    );
}

export default ProgramCalendarView;
