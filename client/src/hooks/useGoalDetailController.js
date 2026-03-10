import { useMemo, useState } from 'react';

function resolveNextValue(nextValue, currentValue) {
    return typeof nextValue === 'function' ? nextValue(currentValue) : nextValue;
}

function buildDefaultControllerState(mode, completed, completedAt) {
    return {
        isEditing: mode === 'create' || mode === 'edit',
        localCompleted: mode === 'create' ? false : (completed || false),
        localCompletedAt: mode === 'create' ? null : (completedAt || null),
        targetToEdit: null,
        viewState: 'goal',
    };
}

export function useGoalDetailController({
    goal,
    goalId,
    mode,
    onClose,
    onToggleCompletion,
    resetForm,
}) {
    const [controllerStateByKey, setControllerStateByKey] = useState({});
    const depGoalIdentity = goal?.attributes?.id || goal?.id;
    const depGoalCompleted = goal?.attributes?.completed;
    const depGoalCompletedAt = goal?.attributes?.completed_at;
    const controllerKey = `${mode}:${depGoalIdentity || 'new-goal'}`;
    const defaultState = useMemo(
        () => buildDefaultControllerState(mode, depGoalCompleted, depGoalCompletedAt),
        [mode, depGoalCompleted, depGoalCompletedAt]
    );
    const controllerState = controllerStateByKey[controllerKey] || defaultState;

    const updateControllerState = (updater) => {
        setControllerStateByKey((prev) => {
            const currentState = prev[controllerKey] || defaultState;
            const nextState =
                typeof updater === 'function' ? updater(currentState) : updater;
            return {
                ...prev,
                [controllerKey]: nextState,
            };
        });
    };

    const clearControllerState = () => {
        setControllerStateByKey((prev) => {
            if (!(controllerKey in prev)) {
                return prev;
            }

            const next = { ...prev };
            delete next[controllerKey];
            return next;
        });
    };

    const setIsEditing = (nextValue) => {
        updateControllerState((prev) => ({
            ...prev,
            isEditing: resolveNextValue(nextValue, prev.isEditing),
        }));
    };

    const setTargetToEdit = (nextValue) => {
        updateControllerState((prev) => ({
            ...prev,
            targetToEdit: resolveNextValue(nextValue, prev.targetToEdit),
        }));
    };

    const setViewState = (nextValue) => {
        updateControllerState((prev) => ({
            ...prev,
            viewState: resolveNextValue(nextValue, prev.viewState),
        }));
    };

    const handleClose = () => {
        clearControllerState();
        if (onClose) {
            onClose();
        }
    };

    const handleCancel = () => {
        if (mode === 'create') {
            handleClose();
            return;
        }

        resetForm();
        updateControllerState({
            ...defaultState,
            isEditing: false,
        });
    };

    const handleCompletionConfirm = (completionDate) => {
        updateControllerState((prev) => ({
            ...prev,
            localCompleted: true,
            localCompletedAt: completionDate.toISOString(),
            viewState: 'goal',
        }));
        onToggleCompletion(goalId, false);
    };

    const handleUncompletionConfirm = () => {
        updateControllerState((prev) => ({
            ...prev,
            localCompleted: false,
            localCompletedAt: null,
            viewState: 'goal',
        }));
        onToggleCompletion(goalId, true);
    };

    return {
        isEditing: controllerState.isEditing,
        setIsEditing,
        localCompletedAt: controllerState.localCompletedAt,
        isCompleted: controllerState.localCompleted || depGoalCompleted || goal?.completed || false,
        targetToEdit: controllerState.targetToEdit,
        setTargetToEdit,
        viewState: controllerState.viewState,
        setViewState,
        handleClose,
        handleCancel,
        handleCompletionConfirm,
        handleUncompletionConfirm,
    };
}

export default useGoalDetailController;
