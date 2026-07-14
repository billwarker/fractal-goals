import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { useActivities } from '../../contexts/ActivitiesContext';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useFractalTree } from '../../hooks/useGoalQueries';
import ModalBackdrop from '../atoms/ModalBackdrop';
import ActivityBuilderForm from '../activityBuilder/ActivityBuilderForm';
import { flattenGoals } from '../activityBuilder/activityBuilderUtils';
import styles from '../GoalDetailModal.module.css';

function InlineActivityBuilderModal({ rootId, activityGroups = [], activityTemplate = null, onSuccess, onCancel }) {
    const { createActivity, updateActivity } = useActivities();
    const { getGoalColor, getGoalIcon } = useGoalLevels();
    const { data: currentFractal } = useFractalTree(rootId);
    const [draftName, setDraftName] = useState(activityTemplate?.name || '');

    const allGoals = useMemo(() => flattenGoals(currentFractal, null), [currentFractal]);

    const modalContent = (
        <ModalBackdrop className={styles.topLayerModalOverlay} onClose={onCancel}>
            <div className={styles.topLayerModalContent} onClick={(event) => event.stopPropagation()}>
                <div className={styles.activityBuilderHeader}>
                    <button onClick={onCancel} className={styles.backButton}>←</button>
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--color-text-primary)', flex: 1 }}>
                        {draftName.trim()
                            ? `${activityTemplate ? 'Copy Activity' : 'Create New Activity'}: ${draftName.trim()}`
                            : (activityTemplate ? 'Copy Activity' : 'Create New Activity')}
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
                    onNameChange={setDraftName}
                />
            </div>
        </ModalBackdrop>
    );

    return createPortal(modalContent, document.body);
}

export default InlineActivityBuilderModal;
