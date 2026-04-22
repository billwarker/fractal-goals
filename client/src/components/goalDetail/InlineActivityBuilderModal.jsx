import React, { useMemo } from 'react';

import { useActivities } from '../../contexts/ActivitiesContext';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useFractalTree } from '../../hooks/useGoalQueries';
import ActivityBuilderForm from '../activityBuilder/ActivityBuilderForm';
import { flattenGoals } from '../activityBuilder/activityBuilderUtils';
import styles from '../GoalDetailModal.module.css';

function InlineActivityBuilderModal({ rootId, activityGroups = [], onSuccess, onCancel }) {
    const { createActivity, updateActivity } = useActivities();
    const { getGoalColor, getGoalIcon } = useGoalLevels();
    const { data: currentFractal } = useFractalTree(rootId);

    const allGoals = useMemo(() => flattenGoals(currentFractal, null), [currentFractal]);

    return (
        <div className={styles.editContainer}>
            <div className={styles.activityBuilderHeader}>
                <button onClick={onCancel} className={styles.backButton}>←</button>
                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--color-text-primary)', flex: 1 }}>
                    Create New Activity
                </h3>
            </div>
            <ActivityBuilderForm
                key="inline-create"
                allGoals={allGoals}
                editingActivity={null}
                rootId={rootId}
                activityGroups={activityGroups}
                createActivity={createActivity}
                updateActivity={updateActivity}
                onSave={onSuccess}
                onClose={onCancel}
                getGoalColor={getGoalColor}
                getGoalIcon={getGoalIcon}
            />
        </div>
    );
}

export default InlineActivityBuilderModal;
