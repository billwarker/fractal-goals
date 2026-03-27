import React, { useMemo } from 'react';

import { useActivities } from '../contexts/ActivitiesContext';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useActivityGroups } from '../hooks/useActivityQueries';
import { useFractalTree } from '../hooks/useGoalQueries';
import Modal from './atoms/Modal';
import ModalBody from './atoms/ModalBody';
import ActivityBuilderForm from './activityBuilder/ActivityBuilderForm';
import { flattenGoals } from './activityBuilder/activityBuilderUtils';

function ActivityBuilder({ isOpen, onClose, editingActivity, rootId, onSave }) {
    const { createActivity, updateActivity } = useActivities();
    const { getGoalColor } = useGoalLevels();
    const { activityGroups = [] } = useActivityGroups(rootId);
    const { data: currentFractal } = useFractalTree(rootId);

    const allGoals = useMemo(
        () => flattenGoals(currentFractal, editingActivity?.id),
        [currentFractal, editingActivity?.id]
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={editingActivity?.id ? 'Edit Activity' : 'Create Activity'}
            size="lg"
        >
            <ModalBody>
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
            </ModalBody>
        </Modal>
    );
}

export default ActivityBuilder;
