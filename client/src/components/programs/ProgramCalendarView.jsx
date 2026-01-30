import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import styles from './ProgramCalendarView.module.css';

function ProgramCalendarView({
    program,
    calendarEvents,
    blockCreationMode,
    setBlockCreationMode,
    onAddBlockClick,
    onDateSelect,
    onEventClick
}) {
    return (
        <div className={styles.calendarContainer}>
            {/* Block creation controls - positioned at top right of calendar area */}
            <div className={styles.headerActions}>
                <button
                    onClick={() => setBlockCreationMode(!blockCreationMode)}
                    className={`${styles.customBtn} ${styles.createModeBtn} ${blockCreationMode ? styles.createModeBtnActive : ''}`}
                >
                    {blockCreationMode ? '✓ Block Creation Mode' : 'Select Dates to Add Block'}
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
                initialDate={program.start_date ? new Date(program.start_date) : new Date()}
                events={calendarEvents}
                height="100%"
                dayMaxEvents={5}
                eventOrder="sortOrder"
                selectable={true}
                select={onDateSelect}
                eventClick={onEventClick}
            />
        </div>
    );
}

export default ProgramCalendarView;
