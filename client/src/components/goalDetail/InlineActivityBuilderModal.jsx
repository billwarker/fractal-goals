import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';

import { useActivities } from '../../contexts/ActivitiesContext';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useFractalTree } from '../../hooks/useGoalQueries';
import ActivityBuilderForm from '../activityBuilder/ActivityBuilderForm';
import { flattenGoals } from '../activityBuilder/activityBuilderUtils';
import styles from '../GoalDetailModal.module.css';

function InlineActivityBuilderModal({ rootId, activityGroups = [], activityTemplate = null, onSuccess, onCancel }) {
    const { createActivity, updateActivity } = useActivities();
    const { getGoalColor, getGoalIcon } = useGoalLevels();
    const { data: currentFractal } = useFractalTree(rootId);

    const allGoals = useMemo(() => flattenGoals(currentFractal, null), [currentFractal]);

    const modalContent = (
        <div className={styles.topLayerModalOverlay} onClick={onCancel}>
            <div className={styles.topLayerModalContent} onClick={(event) => event.stopPropagation()}>
                <div className={styles.activityBuilderHeader}>
                    <button onClick={onCancel} className={styles.backButton}>←</button>
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--color-text-primary)', flex: 1 }}>
                        {activityTemplate ? 'Copy Activity' : 'Create New Activity'}
                    </h3>
                </div>
                <ActivityBuilderForm
                    key={activityTemplate?._builderKey || 'inline-create'}
                    allGoals={allGoals}
                    editingActivity={activityTemplate}
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
        </div>
    );

    return createPortal(modalContent, document.body);
}

export default InlineActivityBuilderModal;
