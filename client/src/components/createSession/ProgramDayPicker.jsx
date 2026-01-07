import React from 'react';
import StepHeader from './StepHeader';

/**
 * Step 1 (Program Mode): Select a Day from Your Program
 * Shows available program days and handles multi-session days
 */
function ProgramDayPicker({
    programDays,
    selectedProgramDay,
    selectedProgramSession,
    hasTemplates,
    onSelectProgramDay,
    onSelectProgramSession,
    onSwitchToTemplate
}) {
    if (programDays.length === 0) {
        return (
            <div style={{
                background: '#1e1e1e',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '24px',
                marginBottom: '24px'
            }}>
                <StepHeader stepNumber={1} title="Select a Day from Your Program" />
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <p style={{ color: '#666', marginBottom: '16px' }}>No active program days available for today</p>
                    {hasTemplates && (
                        <button
                            onClick={onSwitchToTemplate}
                            style={{
                                padding: '10px 20px',
                                background: '#2196f3',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                        >
                            Select Template Instead
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={{
            background: '#1e1e1e',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '24px'
        }}>
            <StepHeader stepNumber={1} title="Select a Day from Your Program" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {programDays.map(programDay => {
                    const isSelected = selectedProgramDay?.day_id === programDay.day_id;
                    const hasMultipleSessions = programDay.sessions.length > 1;

                    return (
                        <div key={programDay.day_id}>
                            <ProgramDayCard
                                programDay={programDay}
                                isSelected={isSelected}
                                hasMultipleSessions={hasMultipleSessions}
                                onClick={() => onSelectProgramDay(programDay)}
                            />

                            {/* Show session selection for multi-session days */}
                            {isSelected && hasMultipleSessions && (
                                <SessionList
                                    sessions={programDay.sessions}
                                    selectedSession={selectedProgramSession}
                                    blockColor={programDay.block_color}
                                    onSelectSession={onSelectProgramSession}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ProgramDayCard({ programDay, isSelected, hasMultipleSessions, onClick }) {
    return (
        <div
            onClick={onClick}
            style={{
                background: isSelected ? '#2a4a2a' : '#2a2a2a',
                border: `2px solid ${isSelected ? '#4caf50' : '#444'}`,
                borderRadius: '6px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{
                    width: '4px',
                    height: '40px',
                    background: programDay.block_color || '#2196f3',
                    borderRadius: '2px'
                }} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
                        {programDay.program_name} - {programDay.block_name}
                    </div>
                    <div style={{ fontSize: '13px', color: '#aaa' }}>
                        {programDay.day_name} (Day {programDay.day_number})
                        {hasMultipleSessions && (
                            <span style={{ marginLeft: '8px', color: '#2196f3' }}>
                                • {programDay.sessions.length} sessions
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {!hasMultipleSessions && (
                <div style={{ marginLeft: '16px', fontSize: '14px' }}>
                    <div style={{
                        padding: '8px',
                        background: 'rgba(33, 150, 243, 0.1)',
                        borderRadius: '4px'
                    }}>
                        <div style={{ fontWeight: 'bold' }}>{programDay.sessions[0].template_name}</div>
                        {programDay.sessions[0].template_description && (
                            <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                                {programDay.sessions[0].template_description}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isSelected && !hasMultipleSessions && (
                <div style={{
                    marginTop: '8px',
                    color: '#4caf50',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    textAlign: 'right'
                }}>
                    ✓ Selected
                </div>
            )}
        </div>
    );
}

function SessionList({ sessions, selectedSession, blockColor, onSelectSession }) {
    return (
        <div style={{
            marginTop: '12px',
            marginLeft: '20px',
            paddingLeft: '16px',
            borderLeft: `3px solid ${blockColor || '#2196f3'}`
        }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#aaa' }}>
                Select a session from this day:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sessions.map((session) => {
                    const isSessionSelected = selectedSession?.template_id === session.template_id;

                    return (
                        <div
                            key={session.template_id}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectSession(session);
                            }}
                            style={{
                                padding: '12px',
                                background: isSessionSelected ? 'rgba(76, 175, 80, 0.2)' : 'rgba(33, 150, 243, 0.05)',
                                border: `2px solid ${isSessionSelected ? '#4caf50' : 'transparent'}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
                                {session.template_name}
                            </div>
                            {session.template_description && (
                                <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                                    {session.template_description}
                                </div>
                            )}
                            {isSessionSelected && (
                                <div style={{
                                    marginTop: '6px',
                                    color: '#4caf50',
                                    fontSize: '12px',
                                    fontWeight: 'bold'
                                }}>
                                    ✓ Selected
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default ProgramDayPicker;
