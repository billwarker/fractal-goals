import React from 'react';
import GoalIcon from '../atoms/GoalIcon';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { isBlockActive, ActiveBlockBadge } from '../../utils/programUtils';
import Card from '../atoms/Card';
import styles from './ProgramBlockView.module.css';
import { useState } from 'react';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';
import EmptyState from '../common/EmptyState';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';

import { useTimezone } from '../../contexts/TimezoneContext';
import {
    formatLiteralDate,
    getDatePart,
    getDaysRemaining,
    getDurationDaysInclusive,
    getISOYMDInTimezone,
    getWeekdayName,
} from '../../utils/dateUtils';

// SVG icons as inline components to avoid extra imports
function IconEdit() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
    );
}

function IconTrash() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
    );
}

function IconLink() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
    );
}

function ProgramBlockView({
    blocks, // sortedBlocks
    blockGoalsByBlockId,
    sessions,
    onEditDay,
    onAttachGoal,
    onEditBlock,
    onDeleteBlock,
    onAddDay,
    onGoalClick,
    onAddBlock,
}) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const { timezone } = useTimezone();
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [blockToDelete, setBlockToDelete] = useState(null);

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return formatLiteralDate(dateString, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const handleDeleteClick = (block) => {
        setBlockToDelete(block);
        setDeleteModalOpen(true);
    };

    const confirmDelete = () => {
        if (blockToDelete) {
            onDeleteBlock(blockToDelete.id);
            setDeleteModalOpen(false);
            setBlockToDelete(null);
        }
    };

    if (!blocks || blocks.length === 0) {
        return (
            <div className={styles.container}>
                <button type="button" className={styles.addBlockButton} onClick={onAddBlock}>
                    <span className={styles.addBlockIcon}>+</span>
                    Add Block
                </button>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {blocks.map(block => {
                const durationDays = getDurationDaysInclusive(block.start_date, block.end_date);
                const blockIsActive = isBlockActive(block);
                const daysRemaining = getDaysRemaining(block.end_date);
                const blockColor = block.color || '#3A86FF';
                const headerBg = `color-mix(in srgb, ${blockColor} 8%, var(--color-bg-card))`;
                const associatedGoals = blockGoalsByBlockId?.get(block.id) || [];
                const blockStartDate = getDatePart(block.start_date);
                const blockEndDate = getDatePart(block.end_date);

                return (
                    <Card
                        key={block.id}
                        className={styles.blockCard}
                        style={{ borderLeftColor: blockColor }}
                    >
                        {/* ── Block Header ─────────────────────────────── */}
                        <div className={styles.blockHeader} style={{ background: headerBg }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div className={styles.blockTitleGroup}>
                                    <h3 className={styles.blockName}>{block.name}</h3>
                                    {blockIsActive && <ActiveBlockBadge />}
                                </div>
                                <div className={styles.blockMeta}>
                                    <span className={styles.blockMetaItem}>
                                        <span className={styles.blockMetaLabel}>Dates</span>
                                        {formatDate(block.start_date)} – {formatDate(block.end_date)}
                                    </span>
                                    <span className={styles.blockMetaItem}>
                                        <span className={styles.blockMetaLabel}>Duration</span>
                                        {durationDays} days
                                    </span>
                                    {blockIsActive && (
                                        <span className={styles.blockMetaItem}>
                                            <span className={styles.blockMetaLabel}>Remaining</span>
                                            <span className={styles.blockMetaValueEmphasis} style={{ color: blockColor }}>
                                                {daysRemaining} days
                                            </span>
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className={styles.blockActions}>
                                <button
                                    type="button"
                                    className={`${styles.iconBtn} ${styles.iconBtnTooltip}`}
                                    onClick={() => onAttachGoal(block.id)}
                                    title="Attach goal"
                                    aria-label="Attach goal"
                                >
                                    <IconLink />
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.iconBtn} ${styles.iconBtnTooltip}`}
                                    onClick={() => onEditBlock(block)}
                                    title="Edit block"
                                    aria-label="Edit block"
                                >
                                    <IconEdit />
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.iconBtn} ${styles.iconBtnDanger} ${styles.iconBtnTooltip}`}
                                    onClick={() => handleDeleteClick(block)}
                                    title="Delete block"
                                    aria-label="Delete block"
                                >
                                    <IconTrash />
                                </button>
                            </div>
                        </div>

                        {/* ── Goals Row ────────────────────────────────── */}
                        {associatedGoals.length > 0 && (
                            <div className={styles.goalList}>
                                {associatedGoals.map((goal) => {
                                    const goalType = goal.attributes?.type || goal.type;
                                    const isCompleted = goal.completed || goal.attributes?.completed;
                                    const goalColor = isCompleted ? 'var(--color-brand-success)' : getGoalColor(goalType);
                                    const goalSecondaryColor = isCompleted
                                        ? 'var(--color-brand-success)'
                                        : getGoalSecondaryColor(goalType);

                                    return (
                                        <button
                                            key={goal.id}
                                            type="button"
                                            className={`${styles.goalListItem} ${isCompleted ? styles.goalListItemCompleted : ''}`}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onGoalClick(goal);
                                            }}
                                            title={goal.name}
                                        >
                                            <GoalIcon
                                                shape={getGoalIcon(goalType)}
                                                color={goalColor}
                                                secondaryColor={goalSecondaryColor}
                                                isSmart={goal.is_smart}
                                                size={14}
                                            />
                                            <span className={styles.goalListItemName}>{goal.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* ── Days Grid ────────────────────────────────── */}
                        <div className={styles.daysSection}>
                            {(() => {
                                const seenKeys = new Set();
                                const sortedDays = [...(block.days || [])].sort((a, b) => {
                                    if (!a.date && b.date) return -1;
                                    if (a.date && !b.date) return 1;
                                    return 0;
                                });

                                const uniqueDays = sortedDays.filter(day => {
                                    const templateIds = (day.templates || []).map(t => t.id).sort().join(',');
                                    const key = `${day.name}-${templateIds}`;
                                    if (seenKeys.has(key)) return false;
                                    seenKeys.add(key);
                                    return true;
                                });

                                return (
                                    <div className={styles.daysGrid}>
                                        {uniqueDays.length === 0 && (
                                            <div className={styles.emptyState}>No days added yet.</div>
                                        )}

                                        {uniqueDays.map(day => (
                                            <div
                                                key={day.id}
                                                onClick={() => onEditDay(block.id, day)}
                                                className={styles.dayCard}
                                                style={{ borderLeftColor: blockColor }}
                                            >
                                                <div className={styles.dayHeader}>
                                                    <div>
                                                        <div className={styles.dayName}>{day.name}</div>
                                                        {(() => {
                                                            const mapping = day.day_of_week;
                                                            if (Array.isArray(mapping) && mapping.length > 0) {
                                                                const dayMap = {
                                                                    'Monday': 'Mon', 'Tuesday': 'Tue', 'Wednesday': 'Wed',
                                                                    'Thursday': 'Thu', 'Friday': 'Fri', 'Saturday': 'Sat', 'Sunday': 'Sun'
                                                                };
                                                                const dayStr = mapping.length === 7 ? 'Daily' : mapping.map(d => dayMap[d] || d.substring(0, 3)).join(' · ');
                                                                return <div className={styles.daySubtext}>{dayStr}</div>;
                                                            } else if (day.date) {
                                                                return <div className={styles.daySubtext}>{getWeekdayName(day.date)}</div>;
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                    {(() => {
                                                        const daySessions = sessions.filter(s => {
                                                            if (s.program_day_id !== day.id || !s.completed) return false;
                                                            const sessionDate = getISOYMDInTimezone(s.session_start || s.created_at, timezone);
                                                            return sessionDate >= blockStartDate && sessionDate <= blockEndDate;
                                                        });

                                                        const completedTemplateIds = new Set(daySessions.filter(s => s.template_id).map(s => s.template_id));
                                                        const templates = day.templates || [];
                                                        const isFullComplete = templates.length > 0 && templates.every(t => completedTemplateIds.has(t.id));

                                                        if (daySessions.length > 0) {
                                                            return (
                                                                <div className={styles.sessionCount}>
                                                                    {daySessions.length}{isFullComplete ? ' ✓' : ''}
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>

                                                <div className={styles.templatesList}>
                                                    {(() => {
                                                        const daySessions = sessions.filter(s => {
                                                            if (s.program_day_id !== day.id || !s.completed) return false;
                                                            const sessionDate = getISOYMDInTimezone(s.session_start || s.created_at, timezone);
                                                            return sessionDate >= blockStartDate && sessionDate <= blockEndDate;
                                                        });

                                                        if (day.templates?.length > 0) {
                                                            return day.templates.map(template => {
                                                                const tSessions = daySessions.filter(s => s.template_id === template.id);
                                                                const sCount = tSessions.length;
                                                                const isDone = sCount > 0;

                                                                return (
                                                                    <div
                                                                        key={template.id}
                                                                        className={`${styles.templateItem} ${isDone ? styles.templateItemDone : styles.templateItemPending}`}
                                                                    >
                                                                        <div className={styles.templateBadgeWrap}>
                                                                            {isDone && <span className={styles.templateDoneMark}>✓</span>}
                                                                            <SessionTemplateNameBadge entity={template} size="sm" />
                                                                        </div>
                                                                        {sCount > 1 && <span className={styles.templateCount}>×{sCount}</span>}
                                                                    </div>
                                                                );
                                                            });
                                                        }
                                                        return <div className={styles.restDay}>Rest</div>;
                                                    })()}
                                                </div>

                                                {day.note_condition && (
                                                    <div className={day.note_condition_satisfied ? styles.noteConditionMet : styles.noteConditionUnmet}>
                                                        {day.note_condition_satisfied ? '✎ Note written' : '✎ Note required'}
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        {/* Add Day card — inline in the grid */}
                                        <button
                                            type="button"
                                            className={styles.addDayCard}
                                            onClick={() => onAddDay(block.id)}
                                            aria-label="Add day to block"
                                        >
                                            <span className={styles.addDayIcon}>+</span>
                                            <span>Add Day</span>
                                        </button>
                                    </div>
                                );
                            })()}
                        </div>
                    </Card>
                );
            })}

            <button type="button" className={styles.addBlockButton} onClick={onAddBlock}>
                <span className={styles.addBlockIcon}>+</span>
                Add Block
            </button>

            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Block"
                message={`Are you sure you want to delete "${blockToDelete?.name}"? This action cannot be undone.`}
                requireMatchingText="delete"
            />
        </div>
    );
}

export default ProgramBlockView;
