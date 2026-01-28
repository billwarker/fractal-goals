import React, { useState, useEffect } from 'react';
import { getGoalColor } from '../../utils/goalColors';
import styles from './DayViewModal.module.css';
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
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.headerTitle}>
                            {formatDate(date)}
                        </h2>
                        <div className={styles.headerMeta}>
                            {scheduledSessions.length + scheduledProgramDays.length} scheduled • {completedSessions.length} completed • {goalsDueOnDate.length} goals due {goalsCompletedOnDate.length > 0 && `• ${goalsCompletedOnDate.length} completed`}
                        </div>
                        {blocksContainingDate.length > 0 && (
                            <div className={styles.headerTags}>
                                {blocksContainingDate.map(block => (
                                    <span key={block.id} className={styles.tag} style={{
                                        background: block.color + '33', // 20% opacity
                                        color: block.color || '#3A86FF',
                                        borderColor: block.color || '#3A86FF'
                                    }}>
                                        {block.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className={styles.closeButton}
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className={styles.contentArea}>

                    {/* Program Days */}
                    {scheduledProgramDayData.length > 0 && (
                        <div className={styles.sectionContainer}>
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
                                    <div key={idx} className={`${styles.programDayCard} ${isPDCompleted ? styles.programDayCardCompleted : ''}`}
                                        style={{ borderLeftColor: isPDCompleted ? '#4caf50' : (day.blockColor || '#3A86FF') }}>
                                        <div className={styles.programDayHeader}>
                                            <div>
                                                <div className={styles.programDayBlockName} style={{ color: isPDCompleted ? '#4caf50' : (day.blockColor || '#3A86FF') }}>
                                                    {day.blockName} {isPDCompleted && '✓'}
                                                </div>
                                                <div className={styles.programDayTitle}>{day.name}</div>
                                            </div>
                                            <button
                                                onClick={() => onUnscheduleDay && onUnscheduleDay(day)}
                                                className={styles.removeButton}
                                                title="Unschedule Day"
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        {/* Templates List */}
                                        {templates.length > 0 && (
                                            <div className={styles.templateList}>
                                                {templates.map(t => {
                                                    const tSessions = sessionsByTemplate[t.id] || [];
                                                    const completedTSessions = tSessions.filter(s => s.completed || s.attributes?.completed);
                                                    const isDone = completedTSessions.length > 0;

                                                    return (
                                                        <div key={t.id}>
                                                            <div className={`${styles.templateHeader} ${isDone ? styles.templateHeaderDone : styles.templateHeaderPending}`}
                                                                style={{ marginBottom: tSessions.length > 0 ? '6px' : '0' }}>
                                                                <span>{isDone ? '✓' : '○'}</span>
                                                                <span style={{ fontWeight: 500 }}>{t.name}</span>
                                                                {completedTSessions.length > 1 && <span className={styles.sessionCountBadge}>{completedTSessions.length}</span>}
                                                            </div>

                                                            {/* Sessions under this template */}
                                                            {tSessions.length > 0 && (
                                                                <div className={styles.templateSessions}>
                                                                    {tSessions.map(s => (
                                                                        <div key={s.id} className={styles.sessionItem}>
                                                                            <div className={s.completed || s.attributes?.completed ? styles.sessionLinkCompleted : styles.sessionLink}>
                                                                                {moment.utc(s.session_start || s.start_time).local().format('h:mm A')} - {s.name}
                                                                            </div>
                                                                            {(s.completed || s.attributes?.completed) && (
                                                                                <div className={styles.sessionDuration}>
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
                                            <div className={styles.unlinkedSessions}>
                                                {unlinkedDaySessions.map(s => (
                                                    <div key={s.id} style={{ fontSize: '12px', color: '#aaa' }}>
                                                        ✓ {s.name} ({s.total_duration_seconds ? moment.duration(s.total_duration_seconds, 'seconds').humanize() : 'Unknown'})
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {day.notes && (
                                            <div className={styles.dayNotes}>
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
                        <div className={styles.sectionContainer}>
                            <h3 className={styles.sectionTitle}>
                                Scheduled Sessions
                            </h3>
                            <div className={styles.listContainer}>
                                {looseScheduledSessions.map(session => (
                                    <div key={session.id} className={styles.card}>
                                        <div className={styles.cardFlex}>
                                            <div className={styles.cardTitle}>
                                                {session.name || 'Untitled Session'}
                                            </div>
                                            <button
                                                onClick={() => onUnscheduleDay && onUnscheduleDay({ ...session, type: 'session' })}
                                                className={styles.removeButton}
                                                style={{ fontSize: '18px', fontWeight: 300 }}
                                                title="Cancel Session"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {scheduledProgramDayData.length === 0 && looseScheduledSessions.length === 0 && (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyStateIcon}>📅</div>
                            <div className={styles.emptyStateTitle}>No program days or sessions scheduled for this date</div>
                            <div className={styles.emptyStateSub}>Add a day to a block to schedule activities</div>
                        </div>
                    )}

                    {/* Completed Sessions Section */}
                    {looseCompletedSessions.length > 0 && (
                        <div className={styles.sectionContainer}>
                            <h3 className={styles.sectionTitle}>
                                Completed Sessions
                            </h3>
                            <div className={styles.listContainer}>
                                {looseCompletedSessions.map(session => (
                                    <div key={session.id} className={styles.card}>
                                        <div className={styles.cardTitle}>
                                            {moment.utc(session.session_end || session.session_start).local().format('h:mm A')} - {session.name || 'Untitled Session'}
                                        </div>
                                        <div className={styles.headerMeta} style={{ fontSize: '12px' }}>
                                            Duration: {session.total_duration_seconds ? moment.duration(session.total_duration_seconds, 'seconds').humanize() : 'Unknown'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Goals Section */}
                    {(goalsDueOnDate.length > 0 || goalsCompletedOnDate.length > 0) && (
                        <div className={styles.sectionContainer}>
                            <h3 className={styles.sectionTitle}>
                                Goals
                            </h3>
                            <div className={styles.listContainer}>
                                {/* Completed Goals */}
                                {goalsCompletedOnDate.map(goal => (
                                    <div key={`comp-${goal.id}`} className={styles.goalCardCompleted}>
                                        <div>
                                            <div style={{ color: 'white', fontSize: '14px' }}>✅ {goal.name}</div>
                                            <div className={styles.goalMeta} style={{ color: '#8bc34a' }}>
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
                                        <div key={`due-${goal.id}`} className={styles.goalCard}
                                            style={{
                                                background: isCompleted ? '#1a2e1a' : '#252525',
                                                borderLeftColor: isCompleted ? '#4caf50' : getGoalColor(goal.type)
                                            }}>
                                            <div style={{ color: 'white', fontSize: '14px' }}>
                                                {isCompleted ? '✅' : '🎯'} {goal.name}
                                            </div>
                                            <div className={styles.goalMeta} style={{ color: isCompleted ? '#8bc34a' : getGoalColor(goal.type) }}>
                                                {goal.type || 'Goal'} • {isCompleted ? `Completed ${completionDate ? 'on ' + getLocalDateString(completionDate) : ''}` : 'Due today'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}


                    {/* Action Controls */}
                    <div className={styles.actionsArea}>
                        {/* Set Goal Deadline Button */}
                        <div>
                            <button
                                onClick={() => setShowGoalSection(!showGoalSection)}
                                className={styles.actionToggle}
                            >
                                <span>🎯 Set Goal Deadline for This Date</span>
                                <span>{showGoalSection ? '−' : '+'}</span>
                            </button>

                            {showGoalSection && (
                                <div className={styles.actionPanel}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>
                                            Select Goal
                                        </label>
                                        <select
                                            value={selectedGoalId}
                                            onChange={(e) => setSelectedGoalId(e.target.value)}
                                            className={styles.select}
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
                                        className={styles.primaryButton}
                                        style={{
                                            background: selectedGoalId ? '#3A86FF' : '#333',
                                            color: selectedGoalId ? 'white' : '#666',
                                            cursor: selectedBlockId ? 'pointer' : 'not-allowed',
                                        }}
                                    >
                                        Set Deadline
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Add Block Day Section (Disabled if day already scheduled) */}
                        {scheduledProgramDayData.length === 0 && looseScheduledSessions.length === 0 && blocks && blocks.length > 0 && onScheduleDay && (
                            <div>
                                <button
                                    onClick={() => setShowAddDaySection(!showAddDaySection)}
                                    className={styles.actionToggle}
                                >
                                    <span>📅 Schedule Day for This Date</span>
                                    <span>{showAddDaySection ? '−' : '+'}</span>
                                </button>

                                {showAddDaySection && (
                                    <div className={styles.actionPanel}>
                                        {/* Block Selection */}
                                        {blocksContainingDate.length > 1 && (
                                            <div className={styles.formGroup}>
                                                <label className={styles.label}>
                                                    Select Block
                                                </label>
                                                <select
                                                    value={selectedBlockId}
                                                    onChange={(e) => setSelectedBlockId(e.target.value)}
                                                    className={styles.select}
                                                >
                                                    <option value="">Choose a block...</option>
                                                    {blocksContainingDate.map(block => (
                                                        <option key={block.id} value={block.id}>{block.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {blocksContainingDate.length === 0 && (
                                            <div className={styles.formGroup}>
                                                <div style={{ marginBottom: '8px', color: '#888', fontSize: '12px' }}>
                                                    Select a block to add this day to:
                                                </div>
                                                <select
                                                    value={selectedBlockId}
                                                    onChange={(e) => setSelectedBlockId(e.target.value)}
                                                    className={styles.select}
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
                                                <div className={styles.label}>
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
                                                                className={styles.optionButton}
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
                                                    className={styles.createButton}
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
                <div className={styles.footer}>
                    <button
                        onClick={onClose}
                        className={styles.closeFooterButton}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DayViewModal;
