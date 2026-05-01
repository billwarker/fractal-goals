import React, { useMemo, useState } from 'react';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import {
    DEFAULT_GOAL_TIMELINE_TYPES,
    useGoalTimeline,
} from '../../hooks/useGoalTimeline';
import { formatDurationSeconds } from '../../utils/formatters';
import GoalIcon from '../atoms/GoalIcon';
import styles from './GoalTimelineView.module.css';

const FILTERS = [
    { type: 'activity', label: 'Activities' },
    { type: 'target', label: 'Targets' },
    { type: 'child_goal', label: 'Child Goals' },
];

function formatDateTime(isoString, timezone) {
    if (!isoString) return { date: '', time: '' };
    try {
        const date = new Date(isoString);
        return {
            date: date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: timezone,
            }),
            time: date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                timeZone: timezone,
            }),
        };
    } catch {
        return { date: '', time: '' };
    }
}

function formatMetricValue(metric) {
    if (!metric || metric.value == null) return null;
    const value = Number(metric.value);
    const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
    return `${metric.name || 'Metric'}: ${formatted}${metric.unit ? ` ${metric.unit}` : ''}`;
}

function GoalTimelineView({ rootId, goalId }) {
    const { timezone } = useTimezone();
    const [selectedTypes, setSelectedTypes] = useState(DEFAULT_GOAL_TIMELINE_TYPES);
    const [includeChildren, setIncludeChildren] = useState(true);
    const { entries, isLoading, error } = useGoalTimeline(rootId, goalId, {
        types: selectedTypes,
        includeChildren,
        limit: 75,
    });

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
                        <TimelineItem key={item.id} item={item} timezone={timezone} />
                    ))}
                </div>
            )}
        </div>
    );
}

function TimelineItem({ item, timezone }) {
    const { date, time } = formatDateTime(item.timestamp, timezone);
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const payload = item.payload || {};
    const metrics = Array.isArray(payload.metrics) ? payload.metrics : [];
    const visibleMetrics = metrics.map(formatMetricValue).filter(Boolean).slice(0, 4);
    const duration = payload.duration_seconds ? formatDurationSeconds(payload.duration_seconds) : null;
    const goalLevel = item.type === 'child_goal' ? getTimelineGoalLevel(payload) : null;
    const goalColor = goalLevel ? getGoalColor(goalLevel) : null;
    const goalSecondaryColor = goalLevel ? getGoalSecondaryColor(goalLevel) : null;
    const goalIcon = goalLevel ? getGoalIcon(goalLevel) : null;

    return (
        <div className={styles.item}>
            <div className={styles.card}>
                <div className={styles.itemTitleRow}>
                    {goalLevel && (
                        <GoalIcon
                            shape={goalIcon}
                            color={goalColor}
                            secondaryColor={goalSecondaryColor}
                            isSmart={Boolean(goalLevel.is_smart)}
                            size={20}
                            className={styles.goalEventIcon}
                        />
                    )}
                    <span className={styles.itemTitle}>{item.title}</span>
                </div>
                {(item.subtitle || duration) && (
                    <div className={styles.subtitle}>
                        {[item.subtitle, duration].filter(Boolean).join(' · ')}
                    </div>
                )}
                <div className={styles.meta}>
                    <span className={styles.pill}>{labelType(item.type)}</span>
                    {goalLevel?.level_name && (
                        <span
                            className={styles.levelPill}
                            style={{ '--timeline-goal-color': goalColor }}
                        >
                            {goalLevel.level_name}
                        </span>
                    )}
                    {item.relationship && <span className={styles.pill}>{labelRelationship(item.relationship)}</span>}
                    {item.source_goal_name && item.relationship !== 'self' && (
                        <span className={styles.pill}>{item.source_goal_name}</span>
                    )}
                </div>
                {visibleMetrics.length > 0 && (
                    <div className={styles.metrics}>
                        {visibleMetrics.map((metric) => (
                            <span key={metric} className={styles.metricPill}>{metric}</span>
                        ))}
                    </div>
                )}
            </div>
            <div className={styles.time}>
                <div>{date}</div>
                <div>{time}</div>
            </div>
        </div>
    );
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

function labelType(type) {
    switch (type) {
        case 'activity': return 'Activity';
        case 'target': return 'Target';
        case 'child_goal': return 'Child Goal';
        default: return 'Event';
    }
}

function labelRelationship(relationship) {
    switch (relationship) {
        case 'self': return 'This goal';
        case 'descendant': return 'Child contribution';
        case 'parent_inherited': return 'Inherited from parent';
        default: return relationship;
    }
}

export default GoalTimelineView;
