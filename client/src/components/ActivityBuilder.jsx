import React, { useMemo } from 'react';

import { useActivities } from '../contexts/ActivitiesContext';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useActivityGroups } from '../hooks/useActivityQueries';
import { useFractalTree } from '../hooks/useGoalQueries';
import ActivityBuilderForm from './activityBuilder/ActivityBuilderForm';
import { flattenGoals } from './activityBuilder/activityBuilderUtils';
import styles from './ActivityBuilder.module.css';

function ActivityBuilder({ isOpen, onClose, editingActivity, rootId, onSave }) {
    const { createActivity, updateActivity } = useActivities();
    const { getGoalColor } = useGoalLevels();
    const { activityGroups = [] } = useActivityGroups(rootId);
    const { data: currentFractal } = useFractalTree(rootId);

    const allGoals = useMemo(
        () => flattenGoals(currentFractal, editingActivity?.id),
        [currentFractal, editingActivity?.id]
    );

    if (!isOpen) {
        return null;
    }

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(event) => event.stopPropagation()}>
                <ActivityBuilderForm
                    key={editingActivity?.id || 'create'}
                    allGoals={allGoals}
                    editingActivity={editingActivity}
                    rootId={rootId}
                    activityGroups={activityGroups}
                    createActivity={createActivity}
                    updateActivity={updateActivity}
                    onSave={onSave}
                    onClose={onClose}
                    getGoalColor={getGoalColor}
                />
            </div>
        </div>
    );
}

export default ActivityBuilder;
