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
} from '../../utils/formatters';
import GoalIcon from '../atoms/GoalIcon';
import { ActivityTimelineCard } from '../common/ActivityTimeline';
import { normalizeTimelineEntry } from './goalTimelineViewModel';
import styles from './GoalTimelineView.module.css';

const FILTERS = [
    { type: 'activity', label: 'Activities' },
    { type: 'target', label: 'Targets' },
    { type: 'goal_lifecycle', label: 'Goal Events' },
];

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

export default GoalTimelineView;
