import React from 'react';
import { getTypeDisplayName } from '../../utils/goalHelpers';
import SMARTIndicator from '../SMARTIndicator';
import { ChevronDownIcon } from '../atoms/AppIcons';
import CloseButton from '../atoms/CloseButton';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatDateInTimezone, formatLiteralDate } from '../../utils/dateUtils';
import { getAgeLabel } from '../../utils/goalTiming';
import styles from './GoalHeader.module.css';

function GoalHeader({
    mode,
    name,
    goal,
    goalType,
    goalColor,
    textColor,
    parentGoal,
    onClose, // Callback to close modal when navigating
    onCollapse, // Mobile panel collapse toggle
    deadline,
    isCompact = false, // Prop to control collapsed state
    goalStatus = 'active',
    isCompleted = false,
    completedAt = null,
    headerTabs = null,
    headerRef = null,
}) {
    const { timezone } = useTimezone();
    const createdAt = goal?.attributes?.created_at || goal?.created_at;
    const displayedDeadline = deadline || goal?.attributes?.deadline || goal?.deadline;
    const displayedCompletedAt = completedAt || goal?.attributes?.completed_at || goal?.completed_at;
    const ageLabel = getAgeLabel(createdAt);
    const completedDateLabel = displayedCompletedAt
        ? formatDateInTimezone(displayedCompletedAt, timezone, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        })
        : null;
    const dueDateLabel = (() => {
        const d = displayedDeadline;
        if (!d) return null;
        const rawDeadline = String(d);
        // Deadlines are often YYYY-MM-DD. Formatting those as UTC can shift the
        // displayed calendar date, so preserve their local date semantics.
        if (rawDeadline.length === 10 && !rawDeadline.includes('T')) {
            return formatLiteralDate(rawDeadline, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            });
        }
        return formatDateInTimezone(d, timezone, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    })();
    const completionReplacesDue = isCompleted && completedDateLabel;
    const terminalDateLabel = completionReplacesDue ? completedDateLabel : dueDateLabel;
    const terminalDateTitle = completionReplacesDue ? 'Completed' : 'Due';
    const normalizedStatus = goalStatus === 'paused'
        ? 'paused'
        : goalStatus === 'inactive'
            ? 'inactive'
            : 'active';
    const statusConfig = {
        active: {
            label: 'Active',
            borderColor: 'color-mix(in srgb, var(--color-brand-success) 62%, var(--color-border))',
            background: 'color-mix(in srgb, var(--color-brand-success) 16%, transparent)',
            color: 'var(--color-brand-success)',
        },
        inactive: {
            label: 'Inactive',
            borderColor: 'var(--color-border)',
            background: 'color-mix(in srgb, var(--color-bg-card) 72%, transparent)',
            color: 'var(--color-text-secondary)',
        },
        paused: {
            label: 'Paused',
            borderColor: 'color-mix(in srgb, #60a5fa 62%, var(--color-border))',
            background: 'color-mix(in srgb, #60a5fa 14%, transparent)',
            color: '#93c5fd',
        },
    }[normalizedStatus];

    return (
        <div
            ref={headerRef}
            className={`${styles.header} ${headerTabs ? styles.headerWithTabs : ''}`}
            style={{
                '--goal-header-color': goalColor,
                '--goal-header-text-color': textColor,
                '--goal-status-border': statusConfig.borderColor,
                '--goal-status-bg': statusConfig.background,
                '--goal-status-color': statusConfig.color,
            }}
        >
            {/* Top Row: Name and Close Button */}
            <div className={styles.topRow}>
                <div className={styles.title}>
                    {mode === 'create' ? (name || 'New Goal') : (name || goal.name)}
                </div>
                <div className={styles.actions}>
                    {onCollapse && (
                        <button
                            onClick={onCollapse}
                            title="Collapse panel"
                            className={styles.collapseButton}
                        >
                            <ChevronDownIcon size={16} />
                        </button>
                    )}
                    {onClose && (
                        <CloseButton
                            onClick={onClose}
                            size={20}
                            className={styles.closeButton}
                        />
                    )}
                </div>
            </div>


            {/* Collapsible Section: Badges, Status, Dates */}
            <div className={`${styles.metaPanel} ${isCompact ? styles.metaPanelCompact : ''}`}>
                {/* Second Row: Badges, Status, and Dates */}
                <div className={styles.metaRow}>
                    <div className={styles.badgeRow}>
                        {mode === 'create' && (
                            <span className={styles.createLabel}>
                                + Create
                            </span>
                        )}
                        <div className={styles.levelBadge}>
                            {getTypeDisplayName(goalType)}
                        </div>

                        <span className={styles.smartBadgeTarget} data-onboarding-target="smart-badge">
                            <SMARTIndicator
                                goal={goal}
                                goalType={goalType}
                                color={goalColor}
                            />
                        </span>
                        {mode !== 'create' && (
                            <>
                                <span className={styles.statusBadge}>
                                    {statusConfig.label}
                                </span>
                            </>
                        )}

                        {mode === 'create' && parentGoal && (
                            <span className={styles.parentLabel}>
                                under "{parentGoal.name}"
                            </span>
                        )}

                        {(mode !== 'create' && (createdAt || terminalDateLabel)) && (
                            <div className={styles.dateRow}>
                                {createdAt && (
                                    <div className={styles.dateItem}>
                                        <span className={styles.dateLabel}>Created</span>
                                        <span className={styles.dateValue}>
                                            {formatDateInTimezone(createdAt, timezone, { month: 'short', day: 'numeric', year: 'numeric', hour: undefined, minute: undefined })}
                                        </span>
                                    </div>
                                )}
                                {terminalDateLabel && (
                                    <div className={styles.dateItem}>
                                        <span className={styles.dateLabel}>{terminalDateTitle}</span>
                                        <span className={styles.dateValue}>
                                            {terminalDateLabel}
                                        </span>
                                    </div>
                                )}
                                {ageLabel && (
                                    <div className={styles.dateItem}>
                                        <span className={styles.dateLabel}>Age</span>
                                        <span className={styles.dateValue}>
                                            {ageLabel}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {mode !== 'create' && headerTabs}
        </div>
    );
}

export default GoalHeader;
