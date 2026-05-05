import React from 'react';
import GoalIcon from '../atoms/GoalIcon';
import CheckIcon from '../atoms/CheckIcon';
import EditIcon from '../atoms/EditIcon';
import LinkIcon from '../atoms/LinkIcon';
import PlusIcon from '../atoms/PlusIcon';
import TrashIcon from '../atoms/TrashIcon';
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
                    <PlusIcon className={styles.addBlockIcon} />
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
                                    <LinkIcon size={14} />
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.iconBtn} ${styles.iconBtnTooltip}`}
                                    onClick={() => onEditBlock(block)}
                                    title="Edit block"
                                    aria-label="Edit block"
                                >
                                    <EditIcon size={14} />
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.iconBtn} ${styles.iconBtnDanger} ${styles.iconBtnTooltip}`}
                                    onClick={() => handleDeleteClick(block)}
                                    title="Delete block"
                                    aria-label="Delete block"
                                >
                                    <TrashIcon size={14} />
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
                                                                            {isDone && <CheckIcon className={styles.templateDoneMark} size={12} />}
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
                                            <PlusIcon className={styles.addDayIcon} />
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
                <PlusIcon className={styles.addBlockIcon} />
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
