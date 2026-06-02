import React, { useMemo, useState } from 'react';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import {
    formatDateValue,
    formatDurationHuman,
    formatLiteralDate,
    getDatePart,
    getISOYMDInTimezone,
} from '../../utils/dateUtils';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import CloseIcon from '../atoms/CloseIcon';
import GoalHierarchySelector from '../goals/GoalHierarchySelector';
import { useProgramDayViewModel } from '../../hooks/useProgramDayViewModel';
import { getProgramDayTemplateRules } from '../../utils/programViewModel';
import { buildProgramGoalScope } from '../../utils/programGoalWindow';
import {
    ProgramCalendarIcon,
    ProgramCheckIcon,
    ProgramMinusIcon,
    ProgramPendingIcon,
    ProgramPlusIcon,
    ProgramTargetIcon,
} from '../programs/ProgramSvgIcons';
import styles from './DayViewModal.module.css';

function getGoalStartDate(goal) {
    return getDatePart(
        goal?.start_date
        || goal?.startDate
        || goal?.attributes?.start_date
        || goal?.attributes?.startDate
        || goal?.target?.start_date
        || goal?.target?.startDate
    );
}

function flattenGoalTree(goals = [], parentId = null, seenIds = new Set()) {
    return goals.flatMap((goal) => {
        const goalId = goal?.id || goal?.attributes?.id;
        if (!goalId || seenIds.has(goalId)) {
            return [];
        }

        seenIds.add(goalId);
        const children = Array.isArray(goal.children) ? goal.children : [];
        const normalizedGoal = {
            ...goal,
            parent_id: goal.parent_id || goal.parentId || goal.attributes?.parent_id || goal.attributes?.parentId || parentId,
            childrenIds: children.map((child) => child?.id || child?.attributes?.id).filter(Boolean),
        };

        return [
            normalizedGoal,
            ...flattenGoalTree(children, goalId, seenIds),
        ];
    });
}

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
    onAttachGoalToDay,
    onScheduleDay,
    onCreateDayForDate,
    onUnscheduleDay,
    blocks,
    sessions,
}) => {
    const { getGoalColor } = useGoalLevels();
    const { timezone } = useTimezone();
    const [selectedGoalId, setSelectedGoalId] = useState('');
    const [selectedGoalDayId, setSelectedGoalDayId] = useState('');
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
    const goalsById = useMemo(
        () => new Map((goals || []).map((goal) => [goal.id || goal.attributes?.id, goal]).filter(([goalId]) => Boolean(goalId))),
        [goals]
    );
    const programScopedGoalOptions = useMemo(() => {
        if (!program) {
            return [];
        }

        const eligibleGoalIds = new Set((eligibleGoalsForDate || []).map((goal) => goal.id || goal.attributes?.id).filter(Boolean));
        const goalScope = buildProgramGoalScope({
            program,
            goals,
            getGoalDetails: (goalId) => goalsById.get(goalId) || null,
        });

        return flattenGoalTree(goalScope.hierarchyGoalSeeds)
            .filter((goal) => eligibleGoalIds.has(goal.id || goal.attributes?.id));
    }, [eligibleGoalsForDate, goals, goalsById, program]);
    const resetLocalState = () => {
        setSelectedBlockId('');
        setShowAddDaySection(false);
        setShowGoalSection(false);
        setSelectedGoalId('');
        setSelectedGoalDayId('');
    };
    const handleClose = () => {
        resetLocalState();
        onClose();
    };
    const getLocalDateString = (dateTimeStr) => getISOYMDInTimezone(dateTimeStr, timezone);

    if (!isOpen || !date) return null;

    const formatSessionCount = (count, label) => `${count} ${label}${count === 1 ? '' : 's'}`;
    const selectedGoal = goals.find((goal) => (goal.id || goal.attributes?.id) === selectedGoalId);
    const goalDayOptions = scheduledProgramDayData.map((day) => ({
        id: day.id,
        blockId: day.blockId,
        name: day.name || `Day ${day.day_number}`,
        blockName: day.blockName,
    }));
    const shouldAttachGoalToDay = Boolean(onAttachGoalToDay && goalDayOptions.length > 0);
    const selectedGoalDay = goalDayOptions.length === 1
        ? goalDayOptions[0]
        : goalDayOptions.find((day) => day.id === selectedGoalDayId);
    const handleDeadlineSubmit = () => {
        if (!selectedGoalId || !onSetGoalDeadline || !selectedGoal) {
            return;
        }

        const startDate = getGoalStartDate(selectedGoal);
        if (startDate && date < startDate) {
            window.alert(`Deadline cannot be before this goal starts on ${formatLiteralDate(startDate, { month: 'short', day: 'numeric', year: 'numeric' })}.`);
            return;
        }

        const currentDeadline = getDatePart(selectedGoal.deadline || selectedGoal.attributes?.deadline);
        if (currentDeadline && currentDeadline !== date) {
            const shouldContinue = window.confirm(
                `This goal already has a deadline of ${formatLiteralDate(currentDeadline, { month: 'short', day: 'numeric', year: 'numeric' })}. Move it to ${formatDate(date)}?`
            );
            if (!shouldContinue) {
                return;
            }
        }

        if (shouldAttachGoalToDay && selectedGoalDay) {
            onAttachGoalToDay({
                block_id: selectedGoalDay.blockId,
                day_id: selectedGoalDay.id,
                goal_id: selectedGoalId,
                deadline: date,
            });
        } else {
            onSetGoalDeadline(selectedGoalId, date);
        }

        setSelectedGoalId('');
        setSelectedGoalDayId('');
        setShowGoalSection(false);
    };

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
                            <CloseIcon size={16} />
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
                                const dayGoalIds = new Set(day.goal_ids || []);
                                const dayGoals = goals.filter((goal) => dayGoalIds.has(goal.id));
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

                                const templateRules = getProgramDayTemplateRules(day);
                                const completedTemplateIds = new Set(templates
                                    .filter(t => sessionsByTemplate[t.id]?.some(s => s.completed || s.attributes?.completed))
                                    .map(t => t.id));
                                const requiredTemplateIds = templateRules
                                    .filter(rule => rule.isRequired)
                                    .map(rule => rule.templateKey);
                                const minTemplates = day.completion_min_templates || null;
                                const hasRule = requiredTemplateIds.length > 0 || minTemplates;
                                const isPDCompleted = templateRules.length > 0
                                    && requiredTemplateIds.every(templateId => completedTemplateIds.has(templateId))
                                    && (!minTemplates || completedTemplateIds.size >= minTemplates)
                                    && (hasRule || completedTemplateIds.size > 0);
                                const completedTemplateCount = templates.filter(t =>
                                    sessionsByTemplate[t.id]?.some(s => s.completed || s.attributes?.completed)
                                ).length;

                                return (
                                    <div key={idx} className={`${styles.programDayCard} ${isPDCompleted ? styles.programDayCardCompleted : ''}`}>
                                        <div className={styles.programDayHeader}>
                                            <div>
                                                <div className={styles.programDayBlockName} style={{ color: isPDCompleted ? '#4caf50' : (day.blockColor || '#3A86FF') }}>
                                                    {day.blockName}
                                                </div>
                                                <div className={styles.programDayTitle}>{day.name}</div>
                                                <div className={styles.programDayStatus}>
                                                    {isPDCompleted ? (
                                                        <>
                                                            <ProgramCheckIcon className={styles.inlineStatusIcon} size={13} />
                                                            <span>Program day completed</span>
                                                        </>
                                                    ) : `${completedTemplateCount}/${templates.length || 0} program sessions completed`}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => onUnscheduleDay && onUnscheduleDay(day)}
                                                className={styles.removeButton}
                                                title={day.isRecurringTemplate ? 'Remove sessions from this date' : 'Unschedule Day'}
                                                aria-label={day.isRecurringTemplate ? 'Remove sessions from this date' : 'Unschedule day'}
                                            >
                                                <CloseIcon size={14} />
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
                                                                {isDone ? (
                                                                    <ProgramCheckIcon className={styles.templateStatusIcon} size={14} />
                                                                ) : (
                                                                    <ProgramPendingIcon className={styles.templateStatusIcon} size={14} />
                                                                )}
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
                                                                                        {formatDateValue(s.session_start || s.start_time, 'h:mm A')}
                                                                                        {showSessionName ? ` - ${s.name}` : ''}
                                                                                    </div>
                                                                                );
                                                                            })()}
                                                                            {(s.completed || s.attributes?.completed) && (
                                                                                <div className={styles.sessionDuration}>
                                                                                    Duration: {s.total_duration_seconds ? formatDurationHuman(s.total_duration_seconds) : 'Unknown'}
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
                                                    <div key={s.id} className={`${styles.dayOptionNotes} ${styles.iconTextRow}`}>
                                                        <ProgramCheckIcon className={styles.inlineStatusIcon} size={13} />
                                                        <span>{s.name} ({s.total_duration_seconds ? formatDurationHuman(s.total_duration_seconds) : 'Unknown'})</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {day.notes && (
                                            <div className={styles.dayNotes}>
                                                {day.notes}
                                            </div>
                                        )}

                                        {dayGoals.length > 0 && (
                                            <div className={styles.dayNotes}>
                                                {dayGoals.map((goal) => (
                                                    <div key={goal.id}>
                                                        Goal: {goal.name}
                                                    </div>
                                                ))}
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
                                                title="Cancel Session"
                                                aria-label="Cancel session"
                                            >
                                                <CloseIcon size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {scheduledProgramDayData.length === 0 && looseScheduledSessions.length === 0 && (
                        <div className={styles.emptyState}>
                            <ProgramCalendarIcon className={styles.emptyStateIcon} size={30} />
                            <div className={styles.emptyStateTitle}>
                                {program ? 'No program days or sessions scheduled for this date' : 'No program scheduled for this date'}
                            </div>
                            <div className={styles.emptyStateSub}>
                                {program ? 'Add a day to a block to schedule activities' : 'You can still review goals due on this date or set a new deadline.'}
                            </div>
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
                                            {formatDateValue(session.session_end || session.session_start, 'h:mm A')} - {session.name || 'Untitled Session'}
                                        </div>
                                        <div className={styles.sessionDuration}>
                                            Duration: {session.total_duration_seconds ? formatDurationHuman(session.total_duration_seconds) : 'Unknown'}
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
                                            <div className={styles.goalCardName}>
                                                <ProgramCheckIcon className={styles.goalCardIcon} size={16} />
                                                <span>{goal.name}</span>
                                            </div>
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
                                            }}>
                                            <div className={styles.goalCardName}>
                                                {isCompleted ? (
                                                    <ProgramCheckIcon className={styles.goalCardIcon} size={16} />
                                                ) : (
                                                    <ProgramTargetIcon className={styles.goalCardIcon} size={16} />
                                                )}
                                                <span>{goal.name}</span>
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
                                <span className={styles.actionToggleLabel}>
                                    <ProgramTargetIcon className={styles.actionIcon} size={16} />
                                    <span>Set Goal Deadline for This Date</span>
                                </span>
                                {showGoalSection ? <ProgramMinusIcon size={16} /> : <ProgramPlusIcon size={16} />}
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
                                        <GoalHierarchySelector
                                            goals={programScopedGoalOptions}
                                            selectedGoalIds={selectedGoalId ? [selectedGoalId] : []}
                                            onSelectionChange={(goalIds) => setSelectedGoalId(goalIds[0] || '')}
                                            selectionMode="single"
                                            searchPlaceholder="Search program goals..."
                                            emptyState="No program goals can take this deadline. Check program goal attachments, start dates, and parent deadlines first."
                                            highlightSelectionAncestors
                                            showGoalHighlightHalo
                                        />
                                    </div>
                                    {shouldAttachGoalToDay && goalDayOptions.length > 1 && (
                                        <div className={styles.formGroup}>
                                            <label className={styles.label}>
                                                Attach to Program Day
                                            </label>
                                            <select
                                                value={selectedGoalDayId}
                                                onChange={(event) => setSelectedGoalDayId(event.target.value)}
                                                className={styles.select}
                                            >
                                                <option value="">Choose a day...</option>
                                                {goalDayOptions.map((day) => (
                                                    <option key={day.id} value={day.id}>
                                                        {day.blockName} - {day.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    {shouldAttachGoalToDay && goalDayOptions.length === 1 && (
                                        <div className={styles.actionHint}>
                                            This will attach the goal to {goalDayOptions[0].name} in {goalDayOptions[0].blockName}.
                                        </div>
                                    )}
                                    <button
                                        onClick={handleDeadlineSubmit}
                                        disabled={!selectedGoalId || (shouldAttachGoalToDay && !selectedGoalDay)}
                                        className={styles.primaryButton}
                                        style={{
                                            background: selectedGoalId && (!shouldAttachGoalToDay || selectedGoalDay) ? '#3A86FF' : 'var(--color-bg-input)',
                                            color: selectedGoalId && (!shouldAttachGoalToDay || selectedGoalDay) ? 'white' : 'var(--color-text-muted)',
                                            cursor: selectedGoalId && (!shouldAttachGoalToDay || selectedGoalDay) ? 'pointer' : 'not-allowed',
                                        }}
                                    >
                                        {shouldAttachGoalToDay ? 'Set Deadline and Attach' : 'Set Deadline'}
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
                                    <span className={styles.actionToggleLabel}>
                                        <ProgramCalendarIcon className={styles.actionIcon} size={16} />
                                        <span>Schedule Day for This Date</span>
                                    </span>
                                    {showAddDaySection ? <ProgramMinusIcon size={16} /> : <ProgramPlusIcon size={16} />}
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
                                                    <ProgramPlusIcon className={styles.actionIcon} size={15} />
                                                    <span>Create New Day From Scratch</span>
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
