import React from 'react';
import moment from 'moment';
import { useTheme } from '../../contexts/ThemeContext'
import { useGoalLevels } from '../../contexts/GoalLevelsContext';;
import { isBlockActive, ActiveBlockBadge } from '../../utils/programUtils';
import Card from '../atoms/Card';
import Button from '../atoms/Button';
import styles from './ProgramBlockView.module.css';
import { useState } from 'react';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';

import { useTimezone } from '../../contexts/TimezoneContext';
import { formatDateInTimezone } from '../../utils/dateUtils';

// ... (imports)

function ProgramBlockView({
    blocks, // sortedBlocks
    sessions,
    goals,
    onEditDay,
    onAttachGoal,
    onEditBlock,
    onDeleteBlock,
    onAddDay,
    onGoalClick
}) {
    const { getGoalColor } = useGoalLevels();;
    const { timezone } = useTimezone();
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [blockToDelete, setBlockToDelete] = useState(null);

    // Helper formatter
    const formatDate = (dateString) => {
        if (!dateString) return '';
        return formatDateInTimezone(dateString, timezone, {
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
        return <div className={styles.emptyState}>No blocks defined. Switch to Calendar to add blocks.</div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Blocks</h2>
            </div>

            {blocks.map(block => {
                const start = moment(block.start_date);
                const end = moment(block.end_date);
                const durationDays = end.diff(start, 'days') + 1;

                return (
                    <Card
                        key={block.id}
                        className={styles.blockCard}
                        padding="lg"
                        style={{ borderLeftColor: block.color || '#3A86FF' }}
                    >
                        {/* Main content: Info + Days */}
                        <div className={styles.mainContent}>
                            {/* Block Info Section */}
                            <div className={styles.blockInfo}>
                                {/* Row 1: Name, Badge, Dates, Days Remaining */}
                                <div className={styles.blockHeaderRow}>
                                    <h3 className={styles.blockName}>{block.name}</h3>
                                    {isBlockActive(block) && <ActiveBlockBadge />}

                                    <div className={styles.metaRow}>
                                        <span>{formatDate(block.start_date)} - {formatDate(block.end_date)} • {durationDays} Days</span>
                                        {isBlockActive(block) && (
                                            <span style={{ color: block.color || '#3A86FF', fontWeight: 600 }}>
                                                • {Math.max(0, moment(block.end_date).startOf('day').diff(moment().startOf('day'), 'days'))} Days Remaining
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Row 2: Goal Badges */}
                                <div className={styles.goalBadgesRow}>
                                    {(() => {
                                        const blockStart = moment(block.start_date).startOf('day');
                                        const blockEnd = moment(block.end_date).endOf('day');

                                        const associatedGoals = goals.filter(g => {
                                            if (block.goal_ids?.includes(g.id)) return true;
                                            if (g.deadline) {
                                                const d = moment(g.deadline);
                                                return d.isSameOrAfter(blockStart) && d.isSameOrBefore(blockEnd);
                                            }
                                            return false;
                                        });

                                        associatedGoals.sort((a, b) => {
                                            if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
                                            if (a.deadline) return -1;
                                            if (b.deadline) return 1;
                                            return a.name.localeCompare(b.name);
                                        });

                                        return associatedGoals.map(g => {
                                            const goalType = g.attributes?.type || g.type;
                                            const goalColor = getGoalColor(goalType);
                                            const isCompleted = g.completed || g.attributes?.completed;
                                            return (
                                                <div key={g.id}
                                                    className={`${styles.goalBadge} ${isCompleted ? styles.goalBadgeCompleted : ''}`}
                                                    style={{
                                                        border: `1px solid ${goalColor}`,
                                                        color: goalColor,
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onGoalClick(g);
                                                    }}
                                                    title={g.name}
                                                >
                                                    {isCompleted && <span>✓</span>}
                                                    <span>{g.name}</span>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>

                            {/* Days Grid Section */}
                            <div className={styles.daysGrid}>
                                {(() => {
                                    // Deduplicate and filter days
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

                                    if (uniqueDays.length === 0) {
                                        return <div className={styles.emptyState}>No days added yet. Click "+ Add Day" to start your plan.</div>;
                                    }

                                    return uniqueDays.map(day => (
                                        <div key={day.id}
                                            onClick={() => onEditDay(block.id, day)}
                                            className={styles.dayCard}
                                        >
                                            <div className={styles.dayHeader}>
                                                <div>
                                                    <div className={styles.dayName}>
                                                        {day.name}
                                                    </div>
                                                    {(() => {
                                                        const mapping = day.day_of_week;
                                                        if (Array.isArray(mapping) && mapping.length > 0) {
                                                            const dayMap = {
                                                                'Monday': 'Mon', 'Tuesday': 'Tues', 'Wednesday': 'Wed', 'Thursday': 'Thurs',
                                                                'Friday': 'Fri', 'Saturday': 'Sat', 'Sunday': 'Sun'
                                                            };
                                                            const dayStr = mapping.length === 7 ? 'Daily' : mapping.map(d => dayMap[d] || d.substring(0, 3)).join(' | ');
                                                            return <div className={styles.daySubtext}>{dayStr}</div>;
                                                        } else if (day.date) {
                                                            return <div className={styles.daySubtext}>{moment(day.date).format('dddd')}</div>;
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                                {(() => {
                                                    const blockStart = moment(block.start_date).startOf('day');
                                                    const blockEnd = moment(block.end_date).endOf('day');
                                                    const daySessions = sessions.filter(s => {
                                                        if (s.program_day_id !== day.id || !s.completed) return false;
                                                        const sessDate = moment(s.session_start || s.created_at);
                                                        return sessDate.isSameOrAfter(blockStart) && sessDate.isSameOrBefore(blockEnd);
                                                    });

                                                    const completedTemplateIds = new Set(daySessions.filter(s => s.template_id).map(s => s.template_id));
                                                    const templates = day.templates || [];
                                                    const isFullComplete = templates.length > 0 && templates.every(t => completedTemplateIds.has(t.id));

                                                    if (daySessions.length > 0) {
                                                        return (
                                                            <div className={styles.sessionCount}>
                                                                {daySessions.length} {isFullComplete && '✓'}
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>

                                            {/* Day Templates (Sessions) */}
                                            <div className={styles.templatesList}>
                                                {(() => {
                                                    const blockStart = moment(block.start_date).startOf('day');
                                                    const blockEnd = moment(block.end_date).endOf('day');
                                                    const daySessions = sessions.filter(s => {
                                                        if (s.program_day_id !== day.id || !s.completed) return false;
                                                        const sessDate = moment(s.session_start || s.created_at);
                                                        return sessDate.isSameOrAfter(blockStart) && sessDate.isSameOrBefore(blockEnd);
                                                    });

                                                    if (day.templates?.length > 0) {
                                                        return day.templates.map(template => {
                                                            const tSessions = daySessions.filter(s => s.template_id === template.id);
                                                            const sCount = tSessions.length;
                                                            const isDone = sCount > 0;

                                                            return (
                                                                <div key={template.id}
                                                                    className={`${styles.templateItem} ${isDone ? styles.templateItemDone : styles.templateItemPending}`}
                                                                >
                                                                    <span>{isDone ? '✓ ' : ''}{template.name}</span>
                                                                    {sCount > 1 && <span>{sCount}</span>}
                                                                </div>
                                                            );
                                                        });
                                                    }
                                                    return <div className={styles.restDay}>Rest</div>;
                                                })()}
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>

                        {/* Actions Section */}
                        <div className={styles.actionsColumn}>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => onAttachGoal(block.id)}
                                className={styles.fullWidthBtn}
                            >
                                Attach Goal
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => onEditBlock(block)}
                                className={styles.fullWidthBtn}
                            >
                                Edit Block
                            </Button>
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeleteClick(block)}
                                className={styles.fullWidthBtn}
                            >
                                Delete Block
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => onAddDay(block.id)}
                                className={styles.fullWidthBtn}
                            >
                                + Add Day
                            </Button>
                        </div>
                    </Card>
                );
            })}

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
