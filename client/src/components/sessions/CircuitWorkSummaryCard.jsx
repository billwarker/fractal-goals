import React, { memo, useMemo } from 'react';

import { formatShortDuration } from '../../hooks/useSessionDuration';
import CompletionCheckBadge from '../common/CompletionCheckBadge';
import ActivityTagBadges from '../common/ActivityTagBadges';
import ProgressHint from '../common/ProgressHint';
import activityStyles from './ActivityCard.module.css';
import styles from './CircuitWorkSummaryCard.module.css';

function getMemberMetrics(member, slot, activityInstancesById) {
    if (Array.isArray(member.metrics) && member.metrics.length > 0) {
        return member.metrics;
    }

    const activityInstanceId = member.activity_instance_id || slot?.activity_instance_id;
    const activityInstance = activityInstancesById.get(activityInstanceId);
    if (!activityInstance) return [];

    if (member.activity_set_id) {
        return activityInstance.sets?.find((set) => set.id === member.activity_set_id)?.metrics || [];
    }
    return activityInstance.metrics || activityInstance.metric_values || [];
}

function getMetricDisplay(metric, activityDefinition) {
    const metricId = metric.metric_id || metric.metric_definition_id;
    const metricDefinition = activityDefinition?.metric_definitions?.find(
        (definition) => definition.id === metricId,
    );
    const splitDefinition = activityDefinition?.split_definitions?.find(
        (definition) => definition.id === metric.split_id,
    );
    const metricName = metric.name || metricDefinition?.name || '';
    const splitName = metric.split_name || splitDefinition?.name || '';
    const value = metric.value;

    if (!metricName || value === null || value === undefined || value === '') return null;
    return {
        id: metric.id || `${metricId || metricName}-${metric.split_id || 'unsplit'}`,
        metricId,
        label: splitName ? `${splitName} - ${metricName}` : metricName,
        value,
        unit: metric.unit || metricDefinition?.unit || '',
    };
}

const CircuitWorkSummaryCard = memo(function CircuitWorkSummaryCard({
    circuit,
    activities = [],
    activityInstances = [],
    deltaDisplayMode = 'percent',
}) {
    const slotsById = useMemo(
        () => new Map((circuit?.slots || []).map((slot) => [slot.id, slot])),
        [circuit?.slots],
    );
    const activitiesById = useMemo(
        () => new Map(activities.map((activity) => [activity.id, activity])),
        [activities],
    );
    const activityInstancesById = useMemo(
        () => new Map(activityInstances.map((instance) => [instance.id, instance])),
        [activityInstances],
    );
    const rounds = circuit?.rounds || [];
    const roundCount = circuit?.round_count ?? rounds.length;
    const isCompleted = circuit?.status === 'completed' || Boolean(circuit?.completed_at);
    const isPaused = Boolean(circuit?.is_paused);
    const isInProgress = !isCompleted
        && !isPaused
        && (circuit?.status === 'active' || Boolean(circuit?.time_start));
    let statusLabel = 'Incomplete circuit';
    if (isPaused) statusLabel = 'Paused circuit';
    else if (isCompleted) statusLabel = 'Completed circuit';
    else if (isInProgress) statusLabel = 'In-progress circuit';
    const renderedInstanceTags = new Set();

    return (
        <article className={`${activityStyles.activityCard} ${activityStyles.activityCardInstance}`}>
            <header className={activityStyles.activityHeader}>
                <CompletionCheckBadge
                    checked={isCompleted}
                    inProgress={isInProgress}
                    paused={isPaused}
                    className={activityStyles.completionBadge}
                    label={statusLabel}
                />
                <div className={activityStyles.content}>
                    <div className={activityStyles.activityMetaLine}>
                        <span>Circuit</span>
                        <span className={activityStyles.activityMetaSeparator}>•</span>
                        <span>{roundCount} {roundCount === 1 ? 'round' : 'rounds'}</span>
                    </div>
                    <div className={activityStyles.activityTitleRow}>
                        <h4 className={`${activityStyles.activityName} ${styles.title}`}>
                            {circuit?.name || 'Activity Circuit'}
                        </h4>
                        {circuit?.duration_seconds != null && (
                            <span className={activityStyles.activityDuration}>
                                {formatShortDuration(circuit.duration_seconds)}
                            </span>
                        )}
                    </div>

                    {rounds.length > 0 && (
                        <div className={activityStyles.activityData}>
                            <div className={`${activityStyles.setsContainer} ${styles.rounds}`}>
                                {rounds.map((round, roundIndex) => {
                                    const roundNumber = round.round_number || roundIndex + 1;
                                    return (
                                        <section
                                            className={styles.round}
                                            key={round.id || roundNumber}
                                            aria-labelledby={`circuit-${circuit?.id}-round-${roundNumber}`}
                                        >
                                            <div
                                                className={styles.roundLabel}
                                                id={`circuit-${circuit?.id}-round-${roundNumber}`}
                                            >
                                                Round {roundNumber}
                                            </div>
                                            <ol className={styles.members}>
                                                {(round.members || []).map((member, memberIndex) => {
                                                    const slot = slotsById.get(member.circuit_run_slot_id);
                                                    const activityDefinition = activitiesById.get(
                                                        slot?.activity_definition_id,
                                                    );
                                                    const memberName = slot?.activity_name
                                                        || activityDefinition?.name
                                                        || `Activity ${memberIndex + 1}`;
                                                    const metrics = getMemberMetrics(
                                                        member,
                                                        slot,
                                                        activityInstancesById,
                                                    ).map((metric) => getMetricDisplay(metric, activityDefinition))
                                                        .filter(Boolean);
                                                    const activityInstanceId = member.activity_instance_id || slot?.activity_instance_id;
                                                    const activityInstance = activityInstancesById.get(activityInstanceId);
                                                    const setIndex = member.activity_set_id
                                                        ? activityInstance?.sets?.findIndex((set) => set.id === member.activity_set_id)
                                                        : null;
                                                    const directSetTags = setIndex != null && setIndex >= 0
                                                        ? activityInstance?.sets?.[setIndex]?.tags || []
                                                        : [];
                                                    const showInstanceTags = activityInstance && !renderedInstanceTags.has(activityInstance.id);
                                                    if (showInstanceTags) renderedInstanceTags.add(activityInstance.id);

                                                    return (
                                                        <li
                                                            className={styles.member}
                                                            key={member.id || `${roundNumber}-${memberIndex}`}
                                                        >
                                                            <span className={`${activityStyles.setLabel} ${styles.memberIndex}`}>
                                                                {roundNumber}.{memberIndex + 1}
                                                            </span>
                                                            <span className={styles.memberContent}>
                                                                <span className={styles.memberName}>
                                                                    {memberName}
                                                                    {activityInstance?.progress_comparison?.included === false ? ' · Excluded' : ''}
                                                                </span>
                                                                {showInstanceTags ? <ActivityTagBadges tags={activityInstance.tags} ariaLabel={`${memberName} activity tags`} /> : null}
                                                                {metrics.length > 0 && (
                                                                    <span
                                                                        className={styles.metrics}
                                                                        aria-label={`${memberName} metrics`}
                                                                    >
                                                                        {metrics.map((metric, metricIndex) => (
                                                                            <span
                                                                                className={activityStyles.metricItem}
                                                                                key={`${metric.id}-${metricIndex}`}
                                                                            >
                                                                                <span className={activityStyles.metricName}>
                                                                                    {metric.label}:
                                                                                </span>
                                                                                <span className={activityStyles.metricValue}>
                                                                                    {metric.value}{metric.unit ? ` ${metric.unit}` : ''}
                                                                                </span>
                                                                                <ProgressHint
                                                                                    metricId={metric.metricId}
                                                                                    setIndex={setIndex >= 0 ? setIndex : null}
                                                                                    progressComparison={activityInstance?.progress_comparison}
                                                                                    displayMode={deltaDisplayMode}
                                                                                />
                                                                            </span>
                                                                        ))}
                                                                    </span>
                                                                )}
                                                                <ActivityTagBadges tags={directSetTags} ariaLabel={`${memberName} set tags`} />
                                                            </span>
                                                        </li>
                                                    );
                                                })}
                                            </ol>
                                        </section>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </header>
        </article>
    );
});

export default CircuitWorkSummaryCard;
