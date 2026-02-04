import React, { useMemo } from 'react';
import StepHeader from './StepHeader';

/**
 * Step 1 (Program Mode): Select a Day from Your Program
 * Shows available program days grouped by block
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
    // Group days by block
    const groupedDays = useMemo(() => {
        const groups = {};
        const order = [];

        programDays.forEach(day => {
            if (!groups[day.block_id]) {
                groups[day.block_id] = {
                    block_id: day.block_id,
                    program_name: day.program_name,
                    block_name: day.block_name,
                    block_color: day.block_color,
                    days: []
                };
                order.push(day.block_id);
            }
            groups[day.block_id].days.push(day);
        });

        return order.map(blockId => groups[blockId]);
    }, [programDays]);

    if (programDays.length === 0) {
        return (
            <div style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '24px',
                marginBottom: '24px'
            }}>
                <StepHeader stepNumber={1} title="Select a Day from Your Program" />
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <p style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }}>No active program days available for today</p>
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
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '24px'
        }}>
            <StepHeader
                stepNumber={1}
                title={groupedDays.length === 1
                    ? `Select a Program Day from ${groupedDays[0].block_name}`
                    : "Select a Program Day from Your Program"
                }
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {groupedDays.map(group => (
                    <BlockGroup
                        key={group.block_id}
                        group={group}
                        selectedProgramDay={selectedProgramDay}
                        selectedProgramSession={selectedProgramSession}
                        onSelectProgramDay={onSelectProgramDay}
                        onSelectProgramSession={onSelectProgramSession}
                    />
                ))}
            </div>
        </div>
    );
}

function BlockGroup({
    group,
    selectedProgramDay,
    selectedProgramSession,
    onSelectProgramDay,
    onSelectProgramSession
}) {
    return (
        <div style={{
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            overflow: 'hidden'
        }}>
            {/* Block Header */}
            <div style={{
                padding: '12px 16px',
                background: 'var(--color-bg-card-alt)',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
            }}>
                <div style={{
                    width: '4px',
                    height: '24px',
                    background: group.block_color || '#2196f3',
                    borderRadius: '2px'
                }} />
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
                    {group.program_name} - {group.block_name}
                </div>
            </div>

            {/* Days List */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {group.days.map((programDay, index) => {
                    const isSelected = selectedProgramDay?.day_id === programDay.day_id;
                    const hasMultipleSessions = programDay.sessions.length > 1;
                    const isLast = index === group.days.length - 1;

                    return (
                        <React.Fragment key={programDay.day_id}>
                            <ProgramDayRow
                                programDay={programDay}
                                isSelected={isSelected}
                                hasMultipleSessions={hasMultipleSessions}
                                onClick={() => onSelectProgramDay(programDay)}
                                isLast={isLast}
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
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}

function ProgramDayRow({ programDay, isSelected, hasMultipleSessions, onClick, isLast }) {
    return (
        <div
            onClick={onClick}
            style={{
                padding: '16px',
                cursor: 'pointer',
                background: isSelected ? 'var(--color-bg-card-hover)' : 'transparent',
                borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
                transition: 'background 0.2s',
                borderLeft: isSelected ? '4px solid #4caf50' : '4px solid transparent'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', fontSize: '15px' }}>
                        {programDay.day_name}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        Day {programDay.day_number}
                        {hasMultipleSessions && (
                            <span style={{ marginLeft: '8px', color: '#2196f3', fontSize: '12px', fontWeight: '500' }}>
                                • {programDay.sessions.length} sessions
                            </span>
                        )}
                    </div>
                </div>

                {!hasMultipleSessions && (
                    <div style={{
                        fontSize: '14px',
                        color: 'var(--color-text-secondary)',
                        background: 'var(--color-bg-card-alt)',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        maxWidth: '50%'
                    }}>
                        {programDay.sessions[0].template_name}
                    </div>
                )}

                {isSelected && !hasMultipleSessions && (
                    <div style={{
                        color: '#4caf50',
                        fontSize: '20px',
                    }}>
                        ✓
                    </div>
                )}
            </div>
        </div>
    );
}

function SessionList({ sessions, selectedSession, blockColor, onSelectSession }) {
    return (
        <div style={{
            padding: '12px 16px 20px 20px', // Extra bottom padding
            background: 'var(--color-bg-card-hover)',
            borderBottom: '1px solid var(--color-border)'
        }}>
            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: 'var(--color-text-muted)', marginLeft: '4px' }}>
                Select a session:
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
                                background: isSessionSelected ? 'rgba(76, 175, 80, 0.1)' : 'var(--color-bg-card)',
                                border: `1px solid ${isSessionSelected ? '#4caf50' : 'var(--color-border)'}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}
                        >
                            <div>
                                <div style={{ fontWeight: '500', fontSize: '14px', color: isSessionSelected ? '#4caf50' : 'var(--color-text-primary)' }}>
                                    {session.template_name}
                                </div>
                                {session.template_description && (
                                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                        {session.template_description}
                                    </div>
                                )}
                            </div>

                            {isSessionSelected && (
                                <div style={{
                                    color: '#4caf50',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }}>
                                    ✓
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
