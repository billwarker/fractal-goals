import React, { useMemo, useState } from 'react';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import {
    DEFAULT_GOAL_TIMELINE_TYPES,
    useGoalTimeline,
} from '../../hooks/useGoalTimeline';
import {
    formatDateTimeParts,
    formatDurationSeconds,
    formatMetricDisplayValue,
} from '../../utils/formatters';
import GoalIcon from '../atoms/GoalIcon';
import { ActivityTimelineCard } from '../common/ActivityTimeline';
import styles from './GoalTimelineView.module.css';

const FILTERS = [
    { type: 'activity', label: 'Activities' },
    { type: 'target', label: 'Targets' },
    { type: 'goal_lifecycle', label: 'Goal Events' },
];

function formatTimelineTitle(item) {
    const payload = item.payload || {};
    const activityName = payload.activity_name || payload.name || payload.definition_name;
    const targetName = payload.name || item.title?.replace(/^(Created|Achieved) target:\s*/i, '');
    const goalName = payload.goal_name || item.title?.replace(/^(Created|Completed|Uncompleted|Paused|Resumed) goal:\s*/i, '');

    switch (item.event_type) {
        case 'activity.completed':
            return `Completed activity: ${activityName || 'Activity'}`;
        case 'activity.associated':
            return `Associated activity: ${activityName || 'Activity'}`;
        case 'activity_group.associated':
            return `Associated activity group: ${payload.activity_group_name || 'Activity group'}`;
        case 'target.created':
            return `Created target: ${targetName || 'Target'}`;
        case 'target.achieved':
            return `Achieved target: ${targetName || 'Target'}`;
        case 'goal.created':
            return `Created goal: ${goalName || 'Goal'}`;
        case 'goal.completed':
            return `Completed goal: ${goalName || 'Goal'}`;
        case 'goal.uncompleted':
            return `Uncompleted goal: ${goalName || 'Goal'}`;
        case 'goal.paused':
            return `Paused goal: ${goalName || 'Goal'}`;
        case 'goal.resumed':
            return `Resumed goal: ${goalName || 'Goal'}`;
        default:
            return item.title || 'Timeline event';
    }
}

function isGoalLifecycleEvent(item) {
    return [
        'goal.created',
        'goal.completed',
        'goal.uncompleted',
        'goal.paused',
        'goal.resumed',
    ].includes(item.event_type);
}

function getGoalLifecycleAction(item) {
    switch (item.event_type) {
        case 'goal.completed': return 'Completed';
        case 'goal.uncompleted': return 'Uncompleted';
        case 'goal.paused': return 'Paused';
        case 'goal.resumed': return 'Resumed';
        case 'goal.created':
        default:
            return 'Created';
    }
}

function formatGoalLevelForTitle(levelName) {
    if (!levelName) return '';
    return levelName.replace(/\s+goal$/i, '').trim();
}

function formatEventLabel(item) {
    switch (item.event_type) {
        case 'activity.completed': return 'Completed activity';
        case 'activity.associated': return 'Activity association';
        case 'activity_group.associated': return 'Activity group association';
        case 'target.created': return 'Target created';
        case 'target.achieved': return 'Target achieved';
        case 'goal.created': return 'Goal created';
        case 'goal.completed': return 'Goal completed';
        case 'goal.uncompleted': return 'Goal uncompleted';
        case 'goal.paused': return 'Goal paused';
        case 'goal.resumed': return 'Goal resumed';
        default: return 'Timeline event';
    }
}

function formatContextText(item) {
    if (!item.relationship || item.relationship === 'self') return null;
    const sourceName = item.source_goal_name;

    if (item.relationship === 'descendant') {
        if (isGoalLifecycleEvent(item)) return null;
        if (item.type === 'child_goal') return 'via child goal';
        return sourceName ? `via child goal: ${sourceName}` : 'via child goal';
    }

    if (item.relationship === 'parent_inherited') {
        return sourceName ? `inherited from parent: ${sourceName}` : 'inherited from parent';
    }

    return null;
}

function getTimelineEntryGoalId(item) {
    return item?.entity_type === 'goal'
        ? item.entity_id
        : item?.payload?.goal_id || item?.source_goal_id || null;
}

function goalIdMatches(left, right) {
    if (left == null || right == null) return false;
    return String(left) === String(right);
}

function getGoalIdentity(goal) {
    return goal?.id || goal?.attributes?.id || null;
}

function normalizeTimelineEntry(item, goalLevelHelpers, currentGoal = null) {
    const payload = item.payload || {};
    const activityInstance = item.event_type === 'activity.completed'
        ? normalizeActivityTimelineInstance(item)
        : null;
    const metrics = Array.isArray(payload.metrics) ? payload.metrics : [];
    const visibleMetrics = metrics.map(formatMetricDisplayValue).filter(Boolean).slice(0, 4);
    const duration = payload.duration_seconds ? formatDurationSeconds(payload.duration_seconds) : null;
    const goalLevel = item.type === 'child_goal' || item.type === 'goal_lifecycle'
        ? getTimelineGoalLevel(payload)
        : null;
    const matchingCurrentGoal = goalIdMatches(getTimelineEntryGoalId(item), getGoalIdentity(currentGoal))
        ? currentGoal
        : null;
    const goalDisplayToken = goalLevel
        ? goalLevel.level_name || goalLevel.type || goalLevel
        : null;
    const goalStyleSource = matchingCurrentGoal || goalDisplayToken;
    const goalColor = goalStyleSource ? goalLevelHelpers.getGoalColor(goalStyleSource) : null;
    const goalSecondaryColor = goalStyleSource ? goalLevelHelpers.getGoalSecondaryColor(goalStyleSource) : null;
    const usesCompletedGoalPalette = item.event_type === 'goal.completed';
    const iconColor = usesCompletedGoalPalette ? goalLevelHelpers.getGoalColor('Completed') : goalColor;
    const iconSecondaryColor = usesCompletedGoalPalette
        ? goalLevelHelpers.getGoalSecondaryColor('Completed')
        : goalSecondaryColor;

    return {
        eventLabel: item.subtitle || (isGoalLifecycleEvent(item) ? '' : formatEventLabel(item)),
        title: formatTimelineTitle(item),
        goalTitle: isGoalLifecycleEvent(item) ? {
            action: getGoalLifecycleAction(item),
            level: formatGoalLevelForTitle(goalLevel?.level_name),
            name: payload.goal_name || 'Goal',
        } : null,
        timestamp: item.timestamp,
        contextText: formatContextText(item),
        duration,
        metrics: visibleMetrics,
        activityInstance,
        activityDef: payload.activity_definition || null,
        progressRecord: payload.progress_comparison || payload.progress_record || null,
        iconConfig: goalLevel ? {
            shape: goalStyleSource ? goalLevelHelpers.getGoalIcon(goalStyleSource) : goalLevel.level?.icon || 'circle',
            color: iconColor,
            secondaryColor: iconSecondaryColor,
            isSmart: Boolean(goalLevel.is_smart),
        } : null,
        levelBadge: goalLevel?.level_name && !isGoalLifecycleEvent(item)
            ? { label: goalLevel.level_name, color: goalColor }
            : null,
    };
}

function GoalTimelineView({ rootId, goalId, currentGoal = null, metrics, onTimeSpentClick, readOnlyEntries = null }) {
    const { timezone } = useTimezone();
    const [selectedTypes, setSelectedTypes] = useState(DEFAULT_GOAL_TIMELINE_TYPES);
    const [includeChildren, setIncludeChildren] = useState(true);
    const isReadOnly = Array.isArray(readOnlyEntries);
    const fetched = useGoalTimeline(rootId, goalId, {
        types: selectedTypes,
        includeChildren,
        limit: 75,
        // When entries are supplied from a snapshot (e.g. public landing page),
        // skip the authenticated fetch entirely.
        enabled: !isReadOnly,
    });
    const entries = isReadOnly ? readOnlyEntries : fetched.entries;
    const isLoading = isReadOnly ? false : fetched.isLoading;
    const error = isReadOnly ? null : fetched.error;

    const selectedSet = useMemo(() => new Set(selectedTypes), [selectedTypes]);
    const toggleType = (type) => {
        setSelectedTypes((current) => {
            if (current.includes(type)) {
                return current.filter((item) => item !== type);
            }
            return [...current, type];
        });
    };

    return (
        <div className={styles.container}>
            {metrics?.recursive && (
                <div className={styles.summary}>
                    <button
                        type="button"
                        className={styles.summaryItemButton}
                        onClick={onTimeSpentClick}
                        disabled={!onTimeSpentClick}
                    >
                        <span className={styles.summaryLabel}>Time Spent:</span>
                        <span className={styles.summaryValue}>
                            {formatDurationSeconds(metrics.recursive.activities_duration_seconds || 0)}
                        </span>
                    </button>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Sessions:</span>
                        <span className={styles.summaryValue}>
                            {metrics.recursive.sessions_count || 0}
                        </span>
                    </div>
                </div>
            )}

            <div className={styles.filters} aria-label="Timeline filters">
                {FILTERS.map(({ type, label }) => {
                    const checked = selectedSet.has(type);
                    return (
                        <label
                            key={type}
                            className={`${styles.filterLabel} ${checked ? styles.filterLabelActive : ''}`}
                        >
                            <input
                                type="checkbox"
                                className={styles.checkbox}
                                checked={checked}
                                onChange={() => toggleType(type)}
                            />
                            {label}
                        </label>
                    );
                })}
                <label className={`${styles.filterLabel} ${includeChildren ? styles.filterLabelActive : ''}`}>
                    <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={includeChildren}
                        onChange={(event) => setIncludeChildren(event.target.checked)}
                    />
                    Include Children Data
                </label>
            </div>

            {isLoading ? (
                <div className={styles.state}>Loading timeline...</div>
            ) : error ? (
                <div className={styles.state}>Timeline could not be loaded.</div>
            ) : entries.length === 0 ? (
                <div className={styles.state}>No timeline events match these filters.</div>
            ) : (
                <div className={styles.timeline}>
                    {entries.map((item) => (
                        <TimelineItem
                            key={item.id}
                            item={item}
                            rootId={rootId}
                            timezone={timezone}
                            currentGoal={currentGoal}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function TimelineItem({ item, rootId, timezone, currentGoal = null }) {
    const { date, time } = formatDateTimeParts(item.timestamp, timezone);
    const goalLevelHelpers = useGoalLevels();
    const card = normalizeTimelineEntry(item, goalLevelHelpers, currentGoal);

    if (card.activityInstance) {
        return (
            <div className={styles.activityEvent}>
                <ActivityTimelineCard
                    instance={card.activityInstance}
                    activityDef={card.activityDef}
                    progressRecord={card.progressRecord}
                    timezone={timezone}
                    showActivityName
                    sessionHref={buildActivityInstanceHref(rootId, card.activityInstance)}
                    timestamp={card.timestamp}
                    showTime
                    variant="goalTimeline"
                />
            </div>
        );
    }

    return (
        <div className={styles.item}>
            <div className={styles.cardHeader}>
                <span className={styles.eventLabel}>{card.eventLabel}</span>
                <span className={styles.time}>
                    <span>{date}</span>
                    <span>{time}</span>
                </span>
            </div>
            <div className={styles.card}>
                <div className={styles.itemTitleRow}>
                    {card.goalTitle ? (
                        <>
                            <span className={styles.itemTitle}>
                                {[
                                    card.goalTitle.action,
                                    card.goalTitle.level,
                                ].filter(Boolean).join(' ')} goal:
                            </span>
                            {card.iconConfig && (
                                <GoalIcon
                                    shape={card.iconConfig.shape}
                                    color={card.iconConfig.color}
                                    secondaryColor={card.iconConfig.secondaryColor}
                                    isSmart={card.iconConfig.isSmart}
                                    size={20}
                                    className={styles.goalEventIcon}
                                />
                            )}
                            <span className={styles.itemTitle}>{card.goalTitle.name}</span>
                        </>
                    ) : (
                        <>
                            {card.iconConfig && (
                                <GoalIcon
                                    shape={card.iconConfig.shape}
                                    color={card.iconConfig.color}
                                    secondaryColor={card.iconConfig.secondaryColor}
                                    isSmart={card.iconConfig.isSmart}
                                    size={20}
                                    className={styles.goalEventIcon}
                                />
                            )}
                            <span className={styles.itemTitle}>{card.title}</span>
                        </>
                    )}
                    {card.levelBadge && (
                        <span
                            className={styles.levelBadge}
                            style={{ '--timeline-goal-color': card.levelBadge.color }}
                        >
                            {card.levelBadge.label}
                        </span>
                    )}
                </div>
                {(card.contextText || card.duration) && (
                    <div className={styles.subtitle}>
                        {[card.contextText, card.duration].filter(Boolean).join(' · ')}
                    </div>
                )}
                {card.metrics.length > 0 && (
                    <div className={styles.metrics}>
                        {card.metrics.map((metric) => (
                            <span key={metric} className={styles.metricPill}>{metric}</span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function buildActivityInstanceHref(rootId, instance) {
    if (!rootId || !instance?.session_id || !instance?.id) return null;
    const params = new URLSearchParams({ activityInstanceId: instance.id });
    return `/${rootId}/session/${instance.session_id}?${params.toString()}`;
}

function normalizeActivityTimelineInstance(item) {
    const payload = item.payload || {};
    const notes = Array.isArray(payload.notes)
        ? payload.notes
        : payload.notes
            ? [{ id: `${item.id}:note`, content: payload.notes, created_at: payload.created_at || item.timestamp }]
            : [];
    return {
        ...payload,
        id: payload.id || item.entity_id || item.id,
        created_at: payload.created_at || item.timestamp,
        metric_values: Array.isArray(payload.metric_values)
            ? payload.metric_values
            : Array.isArray(payload.metrics)
                ? payload.metrics
                : [],
        session_name: payload.session_name || item.subtitle,
        session_template_name: payload.session_template_name || payload.session_name || item.subtitle,
        session_template_color: payload.session_template_color || payload.template_color,
        session_date: payload.session_date || payload.created_at || item.timestamp,
        notes,
    };
}

function getTimelineGoalLevel(payload) {
    const level = payload.level || null;
    return {
        id: payload.goal_id,
        name: payload.goal_name,
        type: payload.type,
        level_id: payload.level_id || level?.id,
        level_name: payload.level_name || level?.name,
        is_smart: Boolean(payload.is_smart),
        level,
    };
}

export default GoalTimelineView;
