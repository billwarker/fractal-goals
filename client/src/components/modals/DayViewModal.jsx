import React, { useState } from 'react';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatLiteralDate, getDatePart, getISOYMDInTimezone } from '../../utils/dateUtils';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import GoalAssociationPicker from '../goals/GoalAssociationPicker';
import { useProgramDayViewModel } from '../../hooks/useProgramDayViewModel';
import styles from './DayViewModal.module.css';
import moment from 'moment';

/**
 * DayViewModal - Modal for viewing and managing program days on a specific date
 * Shows all program days scheduled for the selected date and allows adding new ones
 */
const DayViewModal = ({
    isOpen,
    onClose,
    date,
    program,
    goals,
    onSetGoalDeadline,
    onScheduleDay,
    onCreateDayForDate,
    onUnscheduleDay,
    blocks,
    sessions,
}) => {
    const { getGoalColor } = useGoalLevels();
    const { timezone } = useTimezone();
    const [selectedGoalId, setSelectedGoalId] = useState('');
    const [showGoalSection, setShowGoalSection] = useState(false);
    const [showAddDaySection, setShowAddDaySection] = useState(false);
    const [selectedBlockId, setSelectedBlockId] = useState('');
    const {
        isPastDate,
        blocksContainingDate,
        effectiveBlockId,
        scheduledProgramDayData,
        looseScheduledSessions,
        looseCompletedSessions,
        scheduledSessionCount,
        completedSessionCount,
        goalsDueOnDate,
        goalsCompletedOnDate,
        eligibleGoalsForDate,
        availableScheduleDays,
        formatDate,
    } = useProgramDayViewModel({
        date,
        program,
        goals,
        blocks,
        sessions,
        timezone,
        selectedBlockId,
    });
    const resetLocalState = () => {
        setSelectedBlockId('');
        setShowAddDaySection(false);
        setShowGoalSection(false);
        setSelectedGoalId('');
    };
    const handleClose = () => {
        resetLocalState();
        onClose();
    };
    const getLocalDateString = (dateTimeStr) => getISOYMDInTimezone(dateTimeStr, timezone);

    if (!isOpen || !date || !program) return null;

    const formatSessionCount = (count, label) => `${count} ${label}${count === 1 ? '' : 's'}`;

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={formatDate(date)}
            size="lg"
            customHeader={
                <div className={styles.modalHeaderContent}>
                    <div className={styles.modalHeaderFlex}>
                        <div>
                            <h2 className={styles.modalTitle}>
                                {formatDate(date)}
                            </h2>
                            <div className={styles.modalHeaderStats}>
                                {formatSessionCount(scheduledSessionCount, 'scheduled session')} • {formatSessionCount(completedSessionCount, 'completed session')} • {goalsDueOnDate.length} goals due {goalsCompletedOnDate.length > 0 && `• ${goalsCompletedOnDate.length} completed`}
                            </div>
                            {blocksContainingDate.length > 0 && (
                                <div className={styles.blockBadgesContainer}>
                                    {blocksContainingDate.map(block => (
                                        <span key={block.id} className={styles.blockBadge} style={{
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
                            onClick={handleClose}
                            className={styles.closeButton}
                            aria-label="Close"
                        >
                            ×
                        </button>
                    </div>
                </div>
            }
        >
            <ModalBody>
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
                                const completedTemplateCount = templates.filter(t =>
                                    sessionsByTemplate[t.id]?.some(s => s.completed || s.attributes?.completed)
                                ).length;

                                return (
                                    <div key={idx} className={`${styles.programDayCard} ${isPDCompleted ? styles.programDayCardCompleted : ''}`}
                                        style={{ borderLeftColor: isPDCompleted ? '#4caf50' : (day.blockColor || '#3A86FF') }}>
                                        <div className={styles.programDayHeader}>
                                            <div>
                                                <div className={styles.programDayBlockName} style={{ color: isPDCompleted ? '#4caf50' : (day.blockColor || '#3A86FF') }}>
                                                    {day.blockName}
                                                </div>
                                                <div className={styles.programDayTitle}>{day.name}</div>
                                                <div className={styles.programDayStatus}>
                                                    {isPDCompleted ? '✓ Program day completed' : `${completedTemplateCount}/${templates.length || 0} program sessions completed`}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => onUnscheduleDay && onUnscheduleDay(day)}
                                                className={styles.removeButton}
                                                title={day.isRecurringTemplate ? 'Remove sessions from this date' : 'Unschedule Day'}
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
                                                                            {(() => {
                                                                                const showSessionName = tSessions.length > 1 || s.name !== t.name;
                                                                                return (
                                                                                    <div className={s.completed || s.attributes?.completed ? styles.sessionLinkCompleted : styles.sessionLink}>
                                                                                        {moment.utc(s.session_start || s.start_time).local().format('h:mm A')}
                                                                                        {showSessionName ? ` - ${s.name}` : ''}
                                                                                    </div>
                                                                                );
                                                                            })()}
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
                                                    <div key={s.id} className={styles.dayOptionNotes}>
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
                                        <div className={styles.sessionDuration}>
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
                                        <div className={styles.goalCardFlex}>
                                            <div className={styles.goalCardName}>✅ {goal.name}</div>
                                            <div className={`${styles.goalMeta} ${styles.goalCardMetaCompleted}`}>
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
                                                background: isCompleted ? 'var(--color-bg-success-subtle, rgba(16, 185, 129, 0.1))' : 'var(--color-bg-card-hover)',
                                                borderLeftColor: isCompleted ? 'var(--color-brand-success)' : getGoalColor(goal.type)
                                            }}>
                                            <div className={styles.goalCardName}>
                                                {isCompleted ? '✅' : '🎯'} {goal.name}
                                            </div>
                                            <div className={styles.goalMeta} style={{ color: isCompleted ? 'var(--color-brand-success)' : getGoalColor(goal.type) }}>
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
                                disabled={isPastDate}
                                className={`${styles.actionToggle} ${isPastDate ? styles.actionToggleDisabled : ''}`}
                            >
                                <span>🎯 Set Goal Deadline for This Date</span>
                                <span>{showGoalSection ? '−' : '+'}</span>
                            </button>
                            {isPastDate && (
                                <div className={styles.actionHint}>Not available for past dates.</div>
                            )}

                            {showGoalSection && !isPastDate && (
                                <div className={styles.actionPanel}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>
                                            Select Goal
                                        </label>
                                        <GoalAssociationPicker
                                            goals={eligibleGoalsForDate}
                                            selectedGoalId={selectedGoalId}
                                            onSelectGoal={(goal) => setSelectedGoalId(goal.id)}
                                            associatedGoalIds={goalsDueOnDate.map((goal) => goal.id)}
                                            associationLabel="Due Today"
                                            getAssociationMeta={(goal) => {
                                                const deadline = getDatePart(goal.deadline);
                                                return deadline ? `Current deadline: ${formatLiteralDate(deadline, { month: 'short', day: 'numeric', year: 'numeric' })}` : null;
                                            }}
                                            emptyState="No program goals can take this deadline. Check parent deadlines first."
                                            inputName="day-deadline-goal"
                                        />
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
                                            background: selectedGoalId ? '#3A86FF' : 'var(--color-bg-input)',
                                            color: selectedGoalId ? 'white' : 'var(--color-text-muted)',
                                            cursor: selectedGoalId ? 'pointer' : 'not-allowed',
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
                                    disabled={isPastDate}
                                    className={`${styles.actionToggle} ${isPastDate ? styles.actionToggleDisabled : ''}`}
                                >
                                    <span>📅 Schedule Day for This Date</span>
                                    <span>{showAddDaySection ? '−' : '+'}</span>
                                </button>
                                {isPastDate && (
                                    <div className={styles.actionHint}>Not available for past dates.</div>
                                )}

                                {showAddDaySection && !isPastDate && (
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
                                                <div style={{ marginBottom: '8px', color: 'var(--color-text-muted)', fontSize: '12px' }}>
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
                                                <div className={styles.dayListContainer}>
                                                    {availableScheduleDays.length === 0 ? (
                                                        <div className={styles.emptyDaysHint}>
                                                            No days defined in this block.
                                                        </div>
                                                    ) : (
                                                        availableScheduleDays.map(day => (
                                                            <button
                                                                key={day.id}
                                                                onClick={() => {
                                                                    if (effectiveBlockId) {
                                                                        if (onScheduleDay) onScheduleDay(effectiveBlockId, date, day);
                                                                        setShowAddDaySection(false);
                                                                    }
                                                                }}
                                                                className={styles.optionButton}
                                                            >
                                                                <div>
                                                                    <div className={styles.dayOptionTitle}>{day.name || `Day ${day.day_number}`}</div>
                                                                    {day.notes && <div className={styles.dayOptionNotes}>{day.notes}</div>}
                                                                </div>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>

                                                <button
                                                    onClick={() => {
                                                        const blockId = effectiveBlockId || null;
                                                        if (blockId) {
                                                            if (onCreateDayForDate) {
                                                                onCreateDayForDate(blockId, date);
                                                            } else {
                                                                onScheduleDay(blockId, date, null);
                                                            }
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
            </ModalBody>

            <ModalFooter>
                <Button variant="secondary" onClick={handleClose}>
                    Close
                </Button>
            </ModalFooter>
        </Modal>
    );
};

export default DayViewModal;
