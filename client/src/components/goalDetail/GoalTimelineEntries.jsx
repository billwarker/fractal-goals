import React from 'react';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { formatDateTimeParts } from '../../utils/formatters';
import GoalIcon from '../atoms/GoalIcon';
import { ActivityTimelineCard } from '../common/ActivityTimeline';
import { normalizeTimelineEntry } from './goalTimelineViewModel';
import styles from './GoalTimelineEntries.module.css';

export function GoalTimelineEntries({ entries, rootId, timezone, currentGoal }) {
    return entries.map((item) => (
        <TimelineItem key={item.id} item={item} rootId={rootId} timezone={timezone} currentGoal={currentGoal} />
    ));
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

