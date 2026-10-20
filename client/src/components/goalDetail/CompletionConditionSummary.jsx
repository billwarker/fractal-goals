import React, { useState } from 'react';

import { useGoalConditionProgress } from '../../hooks/useGoalConditionQueries';
import {
    describeCompletionSource,
    describeCondition,
    describeProgress,
    getGoalCompletionCondition,
    getGoalCondition,
    progressFraction,
} from '../../utils/goalConditions';
import ConditionEvidenceModal from './ConditionEvidenceModal';
import ConditionProgressBar from './ConditionProgressBar';
import styles from './CompletionConditionSummary.module.css';

function headline(completionCondition, condition, activity) {
    if (completionCondition === 'activity_threshold' && condition) return describeCondition(condition, activity);
    if (completionCondition === 'children') return 'Completes when every child goal is complete.';
    return 'Completes when you mark it complete.';
}

/**
 * "Completion" section of goal details: how the goal completes, live progress toward it, and the
 * evidence behind an activity threshold. Read-only surfaces pass a published `snapshot`.
 * With `chartShowsProgress`, an activity threshold's progress is the goal's "Progress toward…"
 * chart, so only the "Mark complete" prompt stays here.
 */
function CompletionConditionSummary({
    goal,
    goalId,
    goalName,
    rootId,
    goalColor,
    activityDefinitions = [],
    readOnly = false,
    snapshot = null,
    onCompleteNow,
    chartShowsProgress = false,
    portalContainer = null,
    overlayClassName = '',
}) {
    const [evidenceOpen, setEvidenceOpen] = useState(false);
    const completionCondition = getGoalCompletionCondition(goal);
    const condition = getGoalCondition(goal);
    const activity = activityDefinitions.find((candidate) => candidate.id === condition?.activity_definition_id) || null;
    const tracksProgress = completionCondition !== 'manual';
    const { progressByGoalId } = useGoalConditionProgress(rootId, [goalId], { enabled: tracksProgress && !readOnly });
    const progress = readOnly ? snapshot?.progress : progressByGoalId[goalId];
    const completed = Boolean(goal?.completed ?? goal?.attributes?.completed);
    const source = goal?.completion_state?.source ?? goal?.attributes?.completion_state?.source ?? null;
    const paused = Boolean(goal?.paused ?? goal?.attributes?.paused);
    const metButIncomplete = !completed && !paused && Boolean(progress?.met) && Boolean(onCompleteNow);
    const metPrompt = metButIncomplete ? (
        <div className={styles.metPrompt} role="status">
            <span>Your logged activity already meets this.</span>
            <button type="button" className={styles.metButton} onClick={onCompleteNow}>Mark complete</button>
        </div>
    ) : null;
    if (chartShowsProgress && completionCondition === 'activity_threshold') return metPrompt;
    const canShowEvidence = completionCondition === 'activity_threshold' && condition && (!readOnly || snapshot);

    return (
        <section className={styles.section} aria-label="Completion" style={{ '--condition-accent': goalColor }}>
            <div className={styles.header}>
                <span className={styles.label}>Completion</span>
                {completed && source ? <span className={styles.source}>{describeCompletionSource(source)}</span> : null}
            </div>
            <p className={styles.headline}>{headline(completionCondition, condition, activity)}</p>
            {tracksProgress && progress ? (
                <ConditionProgressBar
                    fraction={completed ? 1 : progressFraction(progress)}
                    label={describeProgress(progress, condition)}
                    met={completed || Boolean(progress.met)}
                    accentColor={goalColor}
                />
            ) : null}
            {metPrompt}
            {canShowEvidence ? (
                <button type="button" className={styles.evidenceButton} onClick={() => setEvidenceOpen(true)}>
                    See the evidence
                </button>
            ) : null}
            {evidenceOpen ? (
                <ConditionEvidenceModal
                    isOpen={evidenceOpen}
                    onClose={() => setEvidenceOpen(false)}
                    rootId={rootId}
                    goalId={goalId}
                    goalName={goalName}
                    accentColor={goalColor}
                    snapshot={readOnly ? snapshot : null}
                    portalContainer={portalContainer}
                    overlayClassName={overlayClassName}
                />
            ) : null}
        </section>
    );
}

export default CompletionConditionSummary;
