import React, { useMemo } from 'react';

import { useGoalLevels } from '../../../contexts/GoalLevelsContext';
import useGoalHierarchyHighlights from '../../../hooks/useGoalHierarchyHighlights';
import { useSessionGoalsViewModel } from '../../../hooks/useSessionGoalsViewModel';
import { formatLiteralDate } from '../../../utils/dateUtils';
import HierarchySection from '../../sessionDetail/HierarchySection';
import sessionStyles from '../../sessionDetail/SessionGoalHierarchyPanel.module.css';
import styles from './ProgramDaysView.module.css';

/**
 * The Days tab's Goals side pane: the session page's goal hierarchy for the active plan card
 * (one template on one date), from `planGoalsView` (utils/planGoalsView.js). It shows the
 * day's goals (else the program's) and the goals its activities serve, highlights the selected
 * activity's goals, and, like the session page, a goal's icon scopes the plan's activity
 * picker to that goal.
 */
export default function PlanGoalHierarchyPanel({
    planGoalsView,
    activities,
    activePlan,
    dayName,
    activityGoalScope,
    onGoalScopeToggle,
    onGoalClick,
    onEditDayGoals = null,
}) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon, getLevelByName } = useGoalLevels();
    const selectedActivityId = activePlan?.selectedActivityId || null;
    const selectedActivity = useMemo(() => (
        selectedActivityId ? { activity_definition_id: selectedActivityId } : null
    ), [selectedActivityId]);
    const {
        sessionHierarchy,
        selectedActivityGoalIds,
        selectedActivityAncestorIds,
        evidenceGoalIds,
        completedEvidenceGoalIds,
    } = useSessionGoalsViewModel({
        sessionGoalsView: planGoalsView,
        // A logged session's instances carry completion and one-off goal links; plans have none.
        activityInstances: activePlan?.instances || null,
        localSessionData: null,
        selectedActivity,
    });
    // A past or logged plan has no picker to scope.
    const canScope = Boolean(activePlan && !activePlan.readOnly);
    const highlights = useGoalHierarchyHighlights({
        selectedActivityGoalIds,
        selectedActivityAncestorIds,
        evidenceGoalIds,
        completedEvidenceGoalIds,
        activityGoalScope,
        onGoalScopeToggle: canScope ? onGoalScopeToggle : null,
        getGoalIcon,
        getGoalColor,
        getGoalSecondaryColor,
    });
    const selectedName = selectedActivityId
        ? activities?.find((activity) => String(activity.id) === String(selectedActivityId))?.name
        : null;

    if (!activePlan) {
        return (
            <div className={`${sessionStyles.goalsPanel} ${styles.planGoalsPanel}`}>
                <p className={sessionStyles.emptyState}>Select a plan to see the goals it works toward.</p>
            </div>
        );
    }
    return (
        <div className={`${sessionStyles.goalsPanel} ${styles.planGoalsPanel}`}>
            <p className={styles.planGoalsContext}>
                <strong>{activePlan.templateName}</strong>
                {' · '}
                {formatLiteralDate(activePlan.date, { weekday: 'short', month: 'short', day: 'numeric', year: undefined })}
            </p>
            {activePlan.readOnly ? (
                <p className={styles.planGoalsHint}>
                    Select an activity to see its goals. Past plans can&apos;t add activities, so goals can&apos;t be scoped here.
                </p>
            ) : null}
            <HierarchySection
                type={selectedName ? 'activity' : 'session'}
                label={selectedName ? `Goals: ${selectedName}` : `${dayName || 'Day'} goals`}
                flattenedHierarchy={sessionHierarchy}
                onGoalClick={onGoalClick}
                getScopedCharacteristics={getLevelByName}
                getGoalColor={getGoalColor}
                getGoalSecondaryColor={getGoalSecondaryColor}
                getGoalIcon={getGoalIcon}
                completedColor={getGoalColor('Completed')}
                completedSecondaryColor={getGoalSecondaryColor('Completed')}
                {...highlights}
                adjustScopeLabel="Edit day goals"
                onAdjustScope={onEditDayGoals || undefined}
            />
            {sessionHierarchy.length === 0 ? (
                <p className={sessionStyles.emptyState}>
                    No goals yet. Give this day goals, or add activities that work toward one.
                </p>
            ) : null}
        </div>
    );
}
