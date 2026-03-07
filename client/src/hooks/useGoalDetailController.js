import { useEffect, useState } from 'react';

export function useGoalDetailController({
    goal,
    goalId,
    mode,
    isOpen,
    onClose,
    onToggleCompletion,
    resetForm,
}) {
    const [isEditing, setIsEditing] = useState(mode === 'create' || mode === 'edit');
    const [localCompleted, setLocalCompleted] = useState(false);
    const [localCompletedAt, setLocalCompletedAt] = useState(null);
    const [targetToEdit, setTargetToEdit] = useState(null);
    const [viewState, setViewState] = useState('goal');
    const [isScrolled, setIsScrolled] = useState(false);

    const depGoalIdentity = goal?.attributes?.id || goal?.id;
    const depGoalCompleted = goal?.attributes?.completed;
    const depGoalCompletedAt = goal?.attributes?.completed_at;

    useEffect(() => {
        if (mode === 'create') {
            /* eslint-disable-next-line react-hooks/set-state-in-effect */
            setLocalCompleted(false);
            setLocalCompletedAt(null);
            setIsEditing(true);
            setTargetToEdit(null);
            setViewState('goal');
            return;
        }

        if (!depGoalIdentity) {
            return;
        }

        setLocalCompleted(depGoalCompleted || false);
        setLocalCompletedAt(depGoalCompletedAt || null);
        setIsEditing(mode === 'edit');
        setTargetToEdit(null);
        setViewState('goal');
    }, [depGoalIdentity, depGoalCompleted, depGoalCompletedAt, mode, isOpen]);

    const handleScroll = (event) => {
        setIsScrolled(event.target.scrollTop > 0);
    };

    const handleCancel = () => {
        if (mode === 'create') {
            if (onClose) {
                onClose();
            }
            return;
        }

        resetForm();
        if (depGoalIdentity) {
            setLocalCompleted(depGoalCompleted || false);
            setLocalCompletedAt(depGoalCompletedAt || null);
        }
        setTargetToEdit(null);
        setIsEditing(false);
    };

    const handleCompletionConfirm = (completionDate) => {
        setLocalCompleted(true);
        setLocalCompletedAt(completionDate.toISOString());
        onToggleCompletion(goalId, false);
        setViewState('goal');
    };

    const handleUncompletionConfirm = () => {
        setLocalCompleted(false);
        setLocalCompletedAt(null);
        onToggleCompletion(goalId, true);
        setViewState('goal');
    };

    return {
        isEditing,
        setIsEditing,
        localCompletedAt,
        isCompleted: localCompleted || depGoalCompleted || goal?.completed || false,
        targetToEdit,
        setTargetToEdit,
        viewState,
        setViewState,
        isScrolled,
        handleScroll,
        handleCancel,
        handleCompletionConfirm,
        handleUncompletionConfirm,
    };
}

export default useGoalDetailController;
