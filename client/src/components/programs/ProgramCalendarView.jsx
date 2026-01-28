import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

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
        <div style={{ height: 'calc(100vh - 200px)', minHeight: '500px', background: 'var(--color-bg-card)', padding: '20px', borderRadius: 'var(--border-radius-lg)', position: 'relative', border: '1px solid var(--color-border)' }}>
            {/* Block creation controls - positioned at top right of calendar area */}
            <div style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                zIndex: 10,
                display: 'flex',
                gap: '8px',
                alignItems: 'center'
            }}>
                <button
                    onClick={() => setBlockCreationMode(!blockCreationMode)}
                    style={{
                        background: blockCreationMode ? 'var(--color-brand-primary)' : 'transparent',
                        border: `1px solid ${blockCreationMode ? 'var(--color-brand-primary)' : 'var(--color-border)'}`,
                        borderRadius: '4px',
                        color: blockCreationMode ? 'white' : 'var(--color-text-secondary)',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {blockCreationMode ? '✓ Block Creation Mode' : 'Select Dates to Add Block'}
                </button>
                <button
                    onClick={onAddBlockClick}
                    style={{
                        background: 'var(--color-brand-primary)',
                        border: 'none',
                        borderRadius: '4px',
                        color: 'white',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                        whiteSpace: 'nowrap'
                    }}
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
