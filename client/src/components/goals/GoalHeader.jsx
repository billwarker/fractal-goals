import React from 'react';
import { getTypeDisplayName } from '../../utils/goalHelpers';
import SMARTIndicator from '../SMARTIndicator';
import { ChevronDownIcon } from '../atoms/AppIcons';
import CloseButton from '../atoms/CloseButton';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatDateInTimezone } from '../../utils/dateUtils';
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
    headerTabs = null,
    headerRef = null,
}) {
    const { timezone } = useTimezone();
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

                        {/* Only show SMART indicator in non-create mode, or if we have enough data */}
                        {mode !== 'create' && (
                            <SMARTIndicator
                                goal={goal}
                                goalType={goalType}
                                color={goalColor}
                            />
                        )}
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

                        {(mode !== 'create' && (goal?.attributes?.created_at || goal?.attributes?.deadline || deadline)) && (
                            <div className={styles.dateRow}>
                                {goal?.attributes?.created_at && (
                                    <div className={styles.dateItem}>
                                        <span className={styles.dateLabel}>Created</span>
                                        <span className={styles.dateValue}>
                                            {formatDateInTimezone(goal.attributes.created_at, timezone, { month: 'short', day: 'numeric', year: 'numeric', hour: undefined, minute: undefined })}
                                        </span>
                                    </div>
                                )}
                                {(deadline || goal?.attributes?.deadline) && (
                                    <div className={styles.dateItem}>
                                        <span className={styles.dateLabel}>Due</span>
                                        <span className={styles.dateValue}>
                                            {(() => {
                                                const d = deadline || goal?.attributes?.deadline;
                                                // Deadlines are often YYYY-MM-DD.
                                                // If we use formatDateInTimezone on YYYY-MM-DD it treats it as UTC and shifts it.
                                                // If it's YYYY-MM-DD we probably want to display it as is, or use the "local date" logic.
                                                if (d && d.length === 10 && !d.includes('T')) {
                                                    const [year, month, day] = d.split('-').map(Number);
                                                    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                                }
                                                return formatDateInTimezone(d, timezone, { month: 'short', day: 'numeric', year: 'numeric' });
                                            })()}
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
