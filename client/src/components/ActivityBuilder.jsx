import React, { useEffect, useMemo } from 'react';

import { useActivities } from '../contexts/ActivitiesContext';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useGoals } from '../contexts/GoalsContext';
import ActivityBuilderForm from './activityBuilder/ActivityBuilderForm';
import { flattenGoals } from './activityBuilder/activityBuilderUtils';
import styles from './ActivityBuilder.module.css';

function ActivityBuilder({ isOpen, onClose, editingActivity, rootId, onSave }) {
    const { createActivity, updateActivity, activityGroups, fetchActivityGroups } = useActivities();
    const { useFractalTreeQuery } = useGoals();
    const { getGoalColor } = useGoalLevels();
    const { data: currentFractal } = useFractalTreeQuery(rootId);

    const allGoals = useMemo(
        () => flattenGoals(currentFractal, editingActivity?.id),
        [currentFractal, editingActivity?.id]
    );

    useEffect(() => {
        if (isOpen && rootId) {
            fetchActivityGroups(rootId);
        }
    }, [fetchActivityGroups, isOpen, rootId]);

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
