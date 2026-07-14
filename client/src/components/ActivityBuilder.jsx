import React, { useMemo, useState } from 'react';

import { useActivities } from '../contexts/ActivitiesContext';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useActivityGroups } from '../hooks/useActivityQueries';
import { useFractalTree } from '../hooks/useGoalQueries';
import Modal from './atoms/Modal';
import ActivityBuilderForm from './activityBuilder/ActivityBuilderForm';
import { flattenGoals } from './activityBuilder/activityBuilderUtils';

function ActivityBuilderDialog({
    onClose,
    editingActivity,
    rootId,
    onSave,
    createActivity,
    updateActivity,
    getGoalColor,
    getGoalIcon,
    activityGroups,
    currentFractal,
}) {
    const [draftName, setDraftName] = useState(editingActivity?.name || '');

    const allGoals = useMemo(
        () => flattenGoals(currentFractal, editingActivity?.id),
        [currentFractal, editingActivity?.id]
    );

    const actionLabel = editingActivity?.id ? 'Edit Activity' : 'Create Activity';
    const modalTitle = draftName.trim() ? `${actionLabel}: ${draftName.trim()}` : actionLabel;

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={modalTitle}
            size="lg"
        >
            <ActivityBuilderForm
                key={editingActivity?.id || editingActivity?._builderKey || 'create'}
                allGoals={allGoals}
                editingActivity={editingActivity}
                rootId={rootId}
                activityGroups={activityGroups}
                createActivity={createActivity}
                updateActivity={updateActivity}
                onSave={onSave}
                onClose={onClose}
                getGoalColor={getGoalColor}
                getGoalIcon={getGoalIcon}
                onNameChange={setDraftName}
            />
        </Modal>
    );
}

function ActivityBuilder({ isOpen, onClose, editingActivity, rootId, onSave }) {
    const { createActivity, updateActivity } = useActivities();
    const { getGoalColor, getGoalIcon } = useGoalLevels();
    const { activityGroups = [] } = useActivityGroups(rootId);
    const { data: currentFractal } = useFractalTree(rootId);

    if (!isOpen) return null;

    return (
        <ActivityBuilderDialog
            key={editingActivity?.id || editingActivity?._builderKey || 'create'}
            onClose={onClose}
            editingActivity={editingActivity}
            rootId={rootId}
            onSave={onSave}
            createActivity={createActivity}
            updateActivity={updateActivity}
            getGoalColor={getGoalColor}
            getGoalIcon={getGoalIcon}
            activityGroups={activityGroups}
            currentFractal={currentFractal}
        />
    );
}

export default ActivityBuilder;
