import React, { useState, useEffect } from 'react';
import { getGoalColor } from '../../utils/goalColors';
import moment from 'moment';

/**
 * DayViewModal - Modal for viewing and managing program days on a specific date
 * Shows all program days scheduled for the selected date and allows adding new ones
 */
const DayViewModal = ({ isOpen, onClose, date, program, goals, onSetGoalDeadline, onScheduleDay, onUnscheduleDay, blocks, sessions }) => {
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

    // 1. Program Days (Legacy Days / Instance Copies)
    const scheduledProgramDays = [];
    if (program.blocks) {
        program.blocks.forEach(block => {
            if (block.days) {
                block.days.forEach(day => {
                    if (day.date === date) {
                        scheduledProgramDays.push({
                            ...day,
                            blockName: block.name,
                            blockId: block.id,
                            blockColor: block.color,
                            type: 'program_day'
                        });
                    }
                });
            }
        });
    }

    // Sessions for this date
    const scheduledSessions = [];
    const completedSessions = [];

    // Helper to get local date string from a datetime
    const getLocalDateString = (dateTimeStr) => {
        if (!dateTimeStr) return null;
        if (dateTimeStr.length === 10) return dateTimeStr;
        const d = new Date(dateTimeStr);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    if (sessions) {
        sessions.forEach(session => {
            const start = session.session_start || session.start_time;
            const sessionLocalDate = getLocalDateString(start);

            if (sessionLocalDate === date) {
                const isCompleted = session.completed || session.attributes?.completed;
                if (isCompleted) {
                    completedSessions.push(session);
                } else {
                    scheduledSessions.push(session);
                }
            }
        });
    }

    const claimedSessionIds = new Set();
    const scheduledProgramDayData = scheduledProgramDays.map(pDay => {
        const templates = pDay.templates || [];
        const daySessions = [];

        [...scheduledSessions, ...completedSessions].forEach(s => {
            if (claimedSessionIds.has(s.id)) return;

            const isPreciseMatch = s.program_day_id === pDay.id;
            const isFuzzyMatch = templates.some(t => t.name === s.name);

            if (isPreciseMatch || isFuzzyMatch) {
                daySessions.push(s);
                claimedSessionIds.add(s.id);
            }
        });

        return { ...pDay, sessions: daySessions };
    });

    const looseScheduledSessions = scheduledSessions.filter(s => !claimedSessionIds.has(s.id));
    const looseCompletedSessions = completedSessions.filter(s => !claimedSessionIds.has(s.id));

    // Find goals due on this date
    const goalsDueOnDate = goals ? goals.filter(g => {
        if (!g.deadline) return false;
        return g.deadline.split('T')[0] === date;
    }) : [];

    // Find goals completed on this date
    const goalsCompletedOnDate = goals ? goals.filter(g => {
        const isCompleted = g.completed || g.attributes?.completed;
        const completionDate = g.completed_at || g.attributes?.completed_at;
        if (!isCompleted || !completionDate) return false;
        return getLocalDateString(completionDate) === date;
    }) : [];

    const formatDate = (dateString) => {
        // Parse as local date by appending noon time to avoid timezone shifts
        // YYYY-MM-DD strings are interpreted as UTC, which can shift the date
        const [year, month, day] = dateString.split('-').map(Number);
        const d = new Date(year, month - 1, day); // month is 0-indexed
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
                            {scheduledSessions.length + scheduledProgramDays.length} scheduled • {completedSessions.length} completed • {goalsDueOnDate.length} goals due {goalsCompletedOnDate.length > 0 && `• ${goalsCompletedOnDate.length} completed`}
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

                    {/* Program Days */}
                    {scheduledProgramDayData.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                            {scheduledProgramDayData.map((day, idx) => {
                                const templates = day.templates || [];
                                const sessionsByTemplate = {};
                                const unlinkedDaySessions = [];

                                day.sessions.forEach(s => {
                                    const matchingT = templates.find(t => t.id === s.template_id || t.name === s.name);
                                    if (matchingT) {
                                        if (!sessionsByTemplate[matchingT.id]) sessionsByTemplate[matchingT.id] = [];
                                        sessionsByTemplate[matchingT.id].push(s);
                                    } else {
                                        unlinkedDaySessions.push(s);
                                    }
                                });

                                const isPDCompleted = templates.length > 0 &&
                                    templates.every(t => sessionsByTemplate[t.id]?.some(s => s.completed || s.attributes?.completed));

                                return (
                                    <div key={idx} style={{
                                        background: isPDCompleted ? '#1a2e1a' : '#252525',
                                        borderRadius: '8px',
                                        padding: '16px',
                                        borderLeft: `4px solid ${isPDCompleted ? '#4caf50' : (day.blockColor || '#3A86FF')}`,
                                        position: 'relative'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                            <div>
                                                <div style={{ color: isPDCompleted ? '#4caf50' : (day.blockColor || '#3A86FF'), fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                                                    {day.blockName} {isPDCompleted && '✓'}
                                                </div>
                                                <div style={{ color: 'white', fontSize: '16px', fontWeight: 600 }}>{day.name}</div>
                                            </div>
                                            <button
                                                onClick={() => onUnscheduleDay && onUnscheduleDay(day)}
                                                style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '16px', padding: '4px', lineHeight: 1 }}
                                                title="Unschedule Day"
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        {/* Templates List */}
                                        {templates.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                                                {templates.map(t => {
                                                    const tSessions = sessionsByTemplate[t.id] || [];
                                                    const completedTSessions = tSessions.filter(s => s.completed || s.attributes?.completed);
                                                    const isDone = completedTSessions.length > 0;

                                                    return (
                                                        <div key={t.id}>
                                                            <div style={{
                                                                fontSize: '13px',
                                                                color: isDone ? '#8bc34a' : '#aaa',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                marginBottom: tSessions.length > 0 ? '6px' : '0'
                                                            }}>
                                                                <span>{isDone ? '✓' : '○'}</span>
                                                                <span style={{ fontWeight: 500 }}>{t.name}</span>
                                                                {completedTSessions.length > 1 && <span style={{ fontSize: '11px', background: '#333', padding: '2px 6px', borderRadius: '4px' }}>{completedTSessions.length}</span>}
                                                            </div>

                                                            {/* Sessions under this template */}
                                                            {tSessions.length > 0 && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '24px' }}>
                                                                    {tSessions.map(s => (
                                                                        <div key={s.id} style={{
                                                                            fontSize: '12px',
                                                                            color: (s.completed || s.attributes?.completed) ? '#888' : '#666',
                                                                            display: 'flex',
                                                                            flexDirection: 'column'
                                                                        }}>
                                                                            <div style={{ color: '#aaa' }}>
                                                                                {moment.utc(s.session_start || s.start_time).local().format('h:mm A')} - {s.name}
                                                                            </div>
                                                                            {(s.completed || s.attributes?.completed) && (
                                                                                <div style={{ fontSize: '11px', color: '#666', marginTop: '1px' }}>
                                                                                    Duration: {s.total_duration_seconds ? moment.duration(s.total_duration_seconds, 'seconds').humanize() : 'Unknown'}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Unlinked Sessions for this day */}
                                        {unlinkedDaySessions.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px', borderTop: '1px solid #333', paddingTop: '12px' }}>
                                                {unlinkedDaySessions.map(s => (
                                                    <div key={s.id} style={{ fontSize: '12px', color: '#aaa' }}>
                                                        ✓ {s.name} ({s.total_duration_seconds ? moment.duration(s.total_duration_seconds, 'seconds').humanize() : 'Unknown'})
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {day.notes && (
                                            <div style={{ color: '#aaa', fontSize: '13px', marginTop: '12px', whiteSpace: 'pre-wrap' }}>
                                                {day.notes}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Scheduled Sessions Section */}
                    {looseScheduledSessions.length > 0 && (
                        <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ color: '#888', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                                Scheduled Sessions
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {looseScheduledSessions.map(session => (
                                    <div key={session.id} style={{
                                        background: '#252525',
                                        borderRadius: '8px',
                                        padding: '12px 16px',
                                        border: '1px solid #333',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>
                                                {session.name || 'Untitled Session'}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => onUnscheduleDay && onUnscheduleDay({ ...session, type: 'session' })}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#666',
                                                cursor: 'pointer',
                                                fontSize: '18px',
                                                fontWeight: 300,
                                                padding: '4px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                            title="Cancel Session"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {scheduledProgramDayData.length === 0 && looseScheduledSessions.length === 0 && (
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
                            <div style={{ fontSize: '14px', marginBottom: '4px' }}>No program days or sessions scheduled for this date</div>
                            <div style={{ fontSize: '12px', color: '#555' }}>Add a day to a block to schedule activities</div>
                        </div>
                    )}

                    {/* Completed Sessions Section */}
                    {looseCompletedSessions.length > 0 && (
                        <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ color: '#888', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                                Completed Sessions
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {looseCompletedSessions.map(session => (
                                    <div key={session.id} style={{
                                        background: '#252525',
                                        borderRadius: '8px',
                                        padding: '12px 16px',
                                        border: '1px solid #333'
                                    }}>
                                        <div style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>
                                            {moment.utc(session.session_end || session.session_start).local().format('h:mm A')} - {session.name || 'Untitled Session'}
                                        </div>
                                        <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
                                            Duration: {session.total_duration_seconds ? moment.duration(session.total_duration_seconds, 'seconds').humanize() : 'Unknown'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Goals Section */}
                    {(goalsDueOnDate.length > 0 || goalsCompletedOnDate.length > 0) && (
                        <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ color: '#888', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                                Goals
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {/* Completed Goals */}
                                {goalsCompletedOnDate.map(goal => (
                                    <div key={`comp-${goal.id}`} style={{
                                        padding: '12px',
                                        background: '#1a2e1a',
                                        borderRadius: '6px',
                                        borderLeft: `3px solid #4caf50`,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ color: 'white', fontSize: '14px' }}>✅ {goal.name}</div>
                                            <div style={{ color: '#8bc34a', fontSize: '11px', marginTop: '4px' }}>
                                                {goal.type || 'Goal'} • Met on this date
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* Due Goals (not already shown in completed) */}
                                {goalsDueOnDate.filter(g => !goalsCompletedOnDate.some(cg => cg.id === g.id)).map(goal => {
                                    const isCompleted = goal.completed || goal.attributes?.completed;
                                    const completionDate = goal.completed_at || goal.attributes?.completed_at;

                                    return (
                                        <div key={`due-${goal.id}`} style={{
                                            padding: '12px',
                                            background: isCompleted ? '#1a2e1a' : '#252525',
                                            borderRadius: '6px',
                                            borderLeft: `3px solid ${isCompleted ? '#4caf50' : getGoalColor(goal.type)}`
                                        }}>
                                            <div style={{ color: 'white', fontSize: '14px' }}>
                                                {isCompleted ? '✅' : '🎯'} {goal.name}
                                            </div>
                                            <div style={{ color: isCompleted ? '#8bc34a' : getGoalColor(goal.type), fontSize: '11px', marginTop: '4px' }}>
                                                {goal.type || 'Goal'} • {isCompleted ? `Completed ${completionDate ? 'on ' + getLocalDateString(completionDate) : ''}` : 'Due today'}
                                            </div>
                                        </div>
                                    );
                                })}
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

                        {/* Add Block Day Section (Disabled if day already scheduled) */}
                        {scheduledProgramDayData.length === 0 && looseScheduledSessions.length === 0 && blocks && blocks.length > 0 && onScheduleDay && (
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
