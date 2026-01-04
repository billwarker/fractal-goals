import React, { useState, useEffect } from 'react';
import { getGoalColor } from '../../utils/goalColors';
import moment from 'moment';

/**
 * DayViewModal - Modal for viewing and managing program days on a specific date
 * Shows all program days scheduled for the selected date and allows adding new ones
 */
const DayViewModal = ({ isOpen, onClose, date, program, goals, onSetGoalDeadline, onScheduleDay, blocks, sessions }) => {
    const [selectedGoalId, setSelectedGoalId] = useState('');
    const [showGoalSection, setShowGoalSection] = useState(false);
    const [showAddDaySection, setShowAddDaySection] = useState(false);
    const [selectedBlockId, setSelectedBlockId] = useState('');

    // Find which blocks contain this date
    const blocksContainingDate = blocks ? blocks.filter(block => {
        if (!block.start_date || !block.end_date) return false;
        const blockStart = new Date(block.start_date);
        const blockEnd = new Date(block.end_date);
        const selectedDate = new Date(date);
        blockStart.setHours(0, 0, 0, 0);
        blockEnd.setHours(23, 59, 59, 999);
        selectedDate.setHours(12, 0, 0, 0);
        return selectedDate >= blockStart && selectedDate <= blockEnd;
    }) : [];

    // Auto-select block if exactly one block contains this date
    useEffect(() => {
        if (blocksContainingDate.length === 1 && !selectedBlockId) {
            setSelectedBlockId(blocksContainingDate[0].id);
        }
    }, [blocksContainingDate, selectedBlockId, date]);

    // Reset state when modal closes or date changes
    useEffect(() => {
        if (!isOpen) {
            setSelectedBlockId('');
            setShowAddDaySection(false);
            setShowGoalSection(false);
            setSelectedGoalId('');
        }
    }, [isOpen]);

    if (!isOpen || !date || !program) return null;

    // Find all program days that match this date
    const programDaysForDate = [];
    if (program.blocks) {
        program.blocks.forEach(block => {
            if (block.days) {
                block.days.forEach(day => {
                    if (day.date === date) {
                        programDaysForDate.push({
                            ...day,
                            blockName: block.name,
                            blockId: block.id,
                            blockColor: block.color
                        });
                    }
                });
            }
        });
    }

    // Find sessions completed on this date
    const completedSessions = sessions ? sessions.filter(session => {
        if (!session.start_time) return false;
        return session.start_time.startsWith(date);
    }) : [];

    // Find goals due on this date
    const goalsDueOnDate = goals ? goals.filter(g => {
        if (!g.deadline) return false;
        return g.deadline.split('T')[0] === date;
    }) : [];

    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return d.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1100,
                padding: '20px'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#1e1e1e',
                    border: '1px solid #444',
                    borderRadius: '12px',
                    width: '100%',
                    maxWidth: '600px',
                    maxHeight: '80vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start'
                }}>
                    <div>
                        <h2 style={{ margin: 0, color: 'white', fontSize: '20px', fontWeight: 600 }}>
                            {formatDate(date)}
                        </h2>
                        <div style={{ color: '#888', fontSize: '13px', marginTop: '4px' }}>
                            {programDaysForDate.length} program days scheduled • {goalsDueOnDate.length} goals due
                        </div>
                        {blocksContainingDate.length > 0 && (
                            <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                                {blocksContainingDate.map(block => (
                                    <span key={block.id} style={{
                                        fontSize: '11px',
                                        background: block.color + '33', // 20% opacity
                                        color: block.color || '#3A86FF',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        border: `1px solid ${block.color || '#3A86FF'}`
                                    }}>
                                        {block.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer', lineHeight: 1 }}
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>

                    {/* Scheduled Program Days */}
                    {programDaysForDate.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                            {programDaysForDate.map((day, idx) => (
                                <div key={idx} style={{
                                    background: '#252525',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    borderLeft: `4px solid ${day.blockColor || '#3A86FF'}`
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <div>
                                            <div style={{ color: day.blockColor || '#3A86FF', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                                                {day.blockName}
                                            </div>
                                            <div style={{ color: 'white', fontSize: '16px', fontWeight: 600 }}>{day.name}</div>
                                        </div>
                                    </div>
                                    {day.notes && (
                                        <div style={{ color: '#aaa', fontSize: '13px', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>
                                            {day.notes}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{
                            textAlign: 'center',
                            padding: '30px 20px',
                            color: '#666',
                            background: '#1a1a1a',
                            borderRadius: '8px',
                            marginBottom: '24px',
                            border: '1px dashed #333'
                        }}>
                            <div style={{ fontSize: '24px', marginBottom: '10px' }}>📅</div>
                            <div style={{ fontSize: '14px', marginBottom: '4px' }}>No program days scheduled for this date</div>
                            <div style={{ fontSize: '12px', color: '#555' }}>Add a day to a block to schedule activities</div>
                        </div>
                    )}

                    {/* Completed Sessions Section */}
                    {completedSessions.length > 0 && (
                        <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ color: '#888', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                                Completed Sessions
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {completedSessions.map(session => (
                                    <div key={session.id} style={{
                                        background: '#252525',
                                        borderRadius: '8px',
                                        padding: '12px 16px',
                                        border: '1px solid #333'
                                    }}>
                                        <div style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>
                                            {moment(session.start_time).format('h:mm A')} - {session.name || 'Untitled Session'}
                                        </div>
                                        <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
                                            Duration: {moment.duration(session.total_duration_seconds, 'seconds').humanize()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Goals Due Section */}
                    {goalsDueOnDate.length > 0 && (
                        <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ color: '#888', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                                Goals Due
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {goalsDueOnDate.map(goal => (
                                    <div key={goal.id} style={{
                                        padding: '12px',
                                        background: '#252525',
                                        borderRadius: '6px',
                                        borderLeft: `3px solid ${getGoalColor(goal.type)}`
                                    }}>
                                        <div style={{ color: 'white', fontSize: '14px' }}>{goal.name}</div>
                                        <div style={{ color: getGoalColor(goal.type), fontSize: '11px', marginTop: '4px' }}>
                                            {goal.type || 'Goal'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}


                    {/* Action Controls */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto' }}>
                        {/* Set Goal Deadline Button */}
                        <div style={{ marginTop: '0', paddingTop: '0' }}>
                            <button
                                onClick={() => setShowGoalSection(!showGoalSection)}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid #444',
                                    borderRadius: '6px',
                                    color: 'white',
                                    padding: '10px 16px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    width: '100%',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <span>🎯 Set Goal Deadline for This Date</span>
                                <span>{showGoalSection ? '−' : '+'}</span>
                            </button>

                            {showGoalSection && (
                                <div style={{ marginTop: '12px', padding: '16px', background: '#252525', borderRadius: '6px' }}>
                                    <div style={{ marginBottom: '12px' }}>
                                        <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px', textTransform: 'uppercase' }}>
                                            Select Goal
                                        </label>
                                        <select
                                            value={selectedGoalId}
                                            onChange={(e) => setSelectedGoalId(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                background: '#1e1e1e',
                                                border: '1px solid #444',
                                                borderRadius: '4px',
                                                color: 'white',
                                                fontSize: '14px'
                                            }}
                                        >
                                            <option value="">Choose a goal...</option>
                                            {goals && goals.map(goal => {
                                                const goalType = goal.attributes?.type || goal.type || '';
                                                return (
                                                    <option key={goal.id} value={goal.id}>
                                                        {goal.name}{goalType ? ` (${goalType})` : ''}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (selectedGoalId && onSetGoalDeadline) {
                                                onSetGoalDeadline(selectedGoalId, date);
                                                setSelectedGoalId('');
                                                setShowGoalSection(false);
                                            }
                                        }}
                                        disabled={!selectedGoalId}
                                        style={{
                                            padding: '10px 16px',
                                            background: selectedGoalId ? '#3A86FF' : '#333',
                                            border: 'none',
                                            borderRadius: '6px',
                                            color: selectedGoalId ? 'white' : '#666',
                                            cursor: selectedBlockId ? 'pointer' : 'not-allowed',
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            width: '100%'
                                        }}
                                    >
                                        Set Deadline
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Add Block Day Section */}
                        {blocks && blocks.length > 0 && onScheduleDay && (
                            <div style={{ marginTop: '0' }}>
                                <button
                                    onClick={() => setShowAddDaySection(!showAddDaySection)}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid #444',
                                        borderRadius: '6px',
                                        color: 'white',
                                        padding: '10px 16px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        width: '100%',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                >
                                    <span>📅 Schedule Day for This Date</span>
                                    <span>{showAddDaySection ? '−' : '+'}</span>
                                </button>

                                {showAddDaySection && (
                                    <div style={{ marginTop: '12px', padding: '16px', background: '#252525', borderRadius: '6px' }}>
                                        {/* Block Selection */}
                                        {blocksContainingDate.length > 1 && (
                                            <div style={{ marginBottom: '12px' }}>
                                                <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px', textTransform: 'uppercase' }}>
                                                    Select Block
                                                </label>
                                                <select
                                                    value={selectedBlockId}
                                                    onChange={(e) => setSelectedBlockId(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px',
                                                        background: '#1e1e1e',
                                                        border: '1px solid #444',
                                                        borderRadius: '4px',
                                                        color: 'white',
                                                        fontSize: '14px'
                                                    }}
                                                >
                                                    <option value="">Choose a block...</option>
                                                    {blocksContainingDate.map(block => (
                                                        <option key={block.id} value={block.id}>{block.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {blocksContainingDate.length === 0 && (
                                            <div style={{ marginBottom: '12px' }}>
                                                <div style={{ marginBottom: '8px', color: '#888', fontSize: '12px' }}>
                                                    Select a block to add this day to:
                                                </div>
                                                <select
                                                    value={selectedBlockId}
                                                    onChange={(e) => setSelectedBlockId(e.target.value)}
                                                    style={{ width: '100%', padding: '10px', background: '#1e1e1e', border: '1px solid #444', borderRadius: '4px', color: 'white', fontSize: '14px' }}
                                                >
                                                    <option value="">Choose a block...</option>
                                                    {blocks.map(block => (
                                                        <option key={block.id} value={block.id}>{block.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {/* Day Selection */}
                                        {(blocksContainingDate.length === 1 || selectedBlockId) && (
                                            <div>
                                                <div style={{ marginBottom: '8px', color: '#888', fontSize: '12px', textTransform: 'uppercase' }}>
                                                    Select a Day to Schedule:
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', marginBottom: '12px' }}>
                                                    {(() => {
                                                        const blockId = selectedBlockId || (blocksContainingDate.length === 1 ? blocksContainingDate[0].id : null);
                                                        const block = blocks?.find(b => b.id === blockId);
                                                        const allDays = block?.days || [];

                                                        // Deduplicate days by Name to return unique "Templates"
                                                        const uniqueDays = [];
                                                        const seenNames = new Set();
                                                        // Prefer days without dates (Masters) first
                                                        const sortedDays = [...allDays].sort((a, b) => {
                                                            if (!a.date && b.date) return -1;
                                                            if (a.date && !b.date) return 1;
                                                            return 0;
                                                        });

                                                        sortedDays.forEach(day => {
                                                            const name = day.name || `Day ${day.day_number}`;
                                                            if (!seenNames.has(name)) {
                                                                seenNames.add(name);
                                                                uniqueDays.push(day);
                                                            }
                                                        });

                                                        if (uniqueDays.length === 0) {
                                                            return (
                                                                <div style={{ padding: '8px', color: '#666', fontStyle: 'italic', fontSize: '13px' }}>
                                                                    No days defined in this block.
                                                                </div>
                                                            );
                                                        }

                                                        return uniqueDays.map(day => (
                                                            <button
                                                                key={day.id}
                                                                onClick={() => {
                                                                    if (blockId) {
                                                                        // Always COPY (Add new instance)
                                                                        if (onScheduleDay) onScheduleDay(blockId, date, day);
                                                                        setShowAddDaySection(false);
                                                                    }
                                                                }}
                                                                style={{
                                                                    padding: '10px',
                                                                    background: '#333',
                                                                    border: '1px solid #444',
                                                                    borderRadius: '6px',
                                                                    color: 'white',
                                                                    textAlign: 'left',
                                                                    cursor: 'pointer',
                                                                    transition: 'background 0.2s',
                                                                    fontSize: '13px',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center'
                                                                }}
                                                                onMouseOver={(e) => e.currentTarget.style.background = '#444'}
                                                                onMouseOut={(e) => e.currentTarget.style.background = '#333'}
                                                            >
                                                                <div>
                                                                    <div style={{ fontWeight: 600 }}>{day.name || `Day ${day.day_number}`}</div>
                                                                    {day.notes && <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{day.notes}</div>}
                                                                </div>
                                                            </button>
                                                        ));
                                                    })()}
                                                </div>

                                                <button
                                                    onClick={() => {
                                                        const blockId = selectedBlockId || (blocksContainingDate.length === 1 ? blocksContainingDate[0].id : null);
                                                        if (blockId) {
                                                            onScheduleDay(blockId, date, null); // Null means create blank
                                                            setShowAddDaySection(false);
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '10px',
                                                        backgroundImage: 'linear-gradient(to right, #3A86FF11, #3A86FF33)',
                                                        border: '1px dashed #3A86FF',
                                                        borderRadius: '6px',
                                                        color: '#3A86FF',
                                                        textAlign: 'center',
                                                        cursor: 'pointer',
                                                        fontSize: '13px',
                                                        fontWeight: 600,
                                                        width: '100%'
                                                    }}
                                                >
                                                    + Create New Day From Scratch
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '20px',
                    borderTop: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px',
                            background: 'transparent',
                            border: '1px solid #444',
                            color: 'white',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DayViewModal;
