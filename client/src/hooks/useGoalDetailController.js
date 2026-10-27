import { useMemo, useState } from 'react';

function resolveNextValue(nextValue, currentValue) {
    return typeof nextValue === 'function' ? nextValue(currentValue) : nextValue;
}

function buildDefaultControllerState(mode, completed, completedAt) {
    return {
        isEditing: mode === 'create' || mode === 'edit',
        localCompleted: mode === 'create' ? false : (completed ?? false),
        localCompletedAt: mode === 'create' ? null : (completedAt || null),
        viewState: 'goal',
    };
}

export function useGoalDetailController({
    goal,
    goalId,
    mode,
    onClose,
    onToggleCompletion,
    onBeforeCompletionConfirm,
    onBeforeUncompletionConfirm,
    resetForm,
}) {
    const [controllerStateByKey, setControllerStateByKey] = useState({});
    const depGoalIdentity = goal?.attributes?.id || goal?.id;
    const depGoalCompleted = goal?.attributes?.completed ?? goal?.completed;
    const depGoalCompletedAt = goal?.attributes?.completed_at ?? goal?.completed_at;
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

    // `sequenceOptions` carries the sequence checkboxes ({ beginNext } / { pauseNext }) to the API.
    const handleCompletionConfirm = async (completionDate, completionNoteContent = '', sequenceOptions = null, attachments = []) => {
        await onBeforeCompletionConfirm?.({ completionDate, noteContent: completionNoteContent, attachments });
        updateControllerState((prev) => ({
            ...prev,
            localCompleted: true,
            localCompletedAt: completionDate.toISOString(),
            viewState: 'goal',
        }));
        await onToggleCompletion?.(goalId, false, sequenceOptions);
    };

    const handleUncompletionConfirm = async (sequenceOptions = null) => {
        await onBeforeUncompletionConfirm?.();
        updateControllerState((prev) => ({
            ...prev,
            localCompleted: false,
            localCompletedAt: null,
            viewState: 'goal',
        }));
        await onToggleCompletion?.(goalId, true, sequenceOptions);
    };

    return {
        isEditing: controllerState.isEditing,
        setIsEditing,
        localCompletedAt: controllerState.localCompletedAt,
        isCompleted: controllerState.localCompleted,
        viewState: controllerState.viewState,
        setViewState,
        handleClose,
        handleCancel,
        handleCompletionConfirm,
        handleUncompletionConfirm,
    };
}

export default useGoalDetailController;
