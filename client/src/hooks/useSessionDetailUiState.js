import { useCallback, useEffect, useState } from 'react';

import { getGoalNodeActivityGroupId } from '../utils/goalNodeModel';

export function useSessionDetailUiState({ rootId, sessionId, isMobile, addActivity, setSidePaneMode }) {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showBuilder, setShowBuilder] = useState(false);
    const [builderActivity, setBuilderActivity] = useState(null);
    const [builderInitialGoalIds, setBuilderInitialGoalIds] = useState([]);
    const [builderInitialGroup, setBuilderInitialGroup] = useState(null);
    const [sectionForNewActivity, setSectionForNewActivity] = useState(null);
    const [selectedGoal, setSelectedGoal] = useState(null);
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [selectedSetIndex, setSelectedSetIndex] = useState(null);
    const [showAssociationModal, setShowAssociationModal] = useState(false);
    const [associationContext, setAssociationContext] = useState(null);
    const [isMobilePaneOpen, setIsMobilePaneOpen] = useState(false);
    const [showOptionsModal, setShowOptionsModal] = useState(false);
    const [goalScopeState, setGoalScopeState] = useState(null);
    const scopedGoal = goalScopeState
        && goalScopeState.rootId === rootId
        && goalScopeState.sessionId === sessionId
        ? goalScopeState.goal
        : null;

    const handleActivityFocus = (instance, setIndex = null) => {
        setSelectedActivity(instance);
        setSelectedSetIndex(setIndex);
    };

    const handleOpenGoals = (instance, context = null) => {
        if (context?.type === 'associate') {
            setAssociationContext(context);
            setShowAssociationModal(true);
            return;
        }

        setSelectedActivity(instance);
        setSelectedSetIndex(null);
        setSidePaneMode('details');
        if (isMobile) setIsMobilePaneOpen(true);
    };

    const handleOpenActivityBuilder = (sectionIndex, activityDefinition = null, options = {}) => {
        const editingExistingDefinition = options.mode === 'edit' && activityDefinition?.id;
        setSectionForNewActivity(editingExistingDefinition ? null : sectionIndex);
        setBuilderActivity(activityDefinition);
        const seedFromScope = !editingExistingDefinition && Boolean(scopedGoal?.id);
        setBuilderInitialGoalIds(seedFromScope ? [String(scopedGoal.id)] : []);
        // New definitions join the scoped goal's activity group (a goal has at most one).
        const scopedGroupId = seedFromScope ? getGoalNodeActivityGroupId(scopedGoal) : null;
        setBuilderInitialGroup(scopedGroupId ? { id: String(scopedGroupId), goalName: scopedGoal.name } : null);
        setShowBuilder(true);
    };

    const handleCloseActivityBuilder = () => {
        setShowBuilder(false);
        setBuilderActivity(null);
        setSectionForNewActivity(null);
    };

    const handleActivityCreated = async (newActivity) => {
        if (!newActivity || sectionForNewActivity == null) return;
        await addActivity(sectionForNewActivity, newActivity.id, newActivity);
        setSectionForNewActivity(null);
        setBuilderActivity(null);
    };

    const handleToggleGoalScope = useCallback((goal) => {
        if (!goal?.id) return;
        setGoalScopeState((current) => (
            current?.rootId === rootId
            && current?.sessionId === sessionId
            && String(current.goal?.id) === String(goal.id)
                ? null
                : { rootId, sessionId, goal }
        ));
    }, [rootId, sessionId]);

    const clearGoalScope = useCallback(() => setGoalScopeState(null), []);

    useEffect(() => {
        if (isMobile) return undefined;

        const timeoutId = window.setTimeout(() => {
            setIsMobilePaneOpen(false);
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [isMobile]);

    return {
        showDeleteConfirm,
        setShowDeleteConfirm,
        showBuilder,
        builderActivity,
        builderInitialGoalIds,
        builderInitialGroup,
        selectedGoal,
        setSelectedGoal,
        selectedActivity,
        selectedSetIndex,
        showAssociationModal,
        setShowAssociationModal,
        associationContext,
        setAssociationContext,
        isMobilePaneOpen,
        setIsMobilePaneOpen,
        handleActivityFocus,
        handleOpenGoals,
        handleOpenActivityBuilder,
        handleCloseActivityBuilder,
        handleActivityCreated,
        showOptionsModal,
        setShowOptionsModal,
        scopedGoal,
        handleToggleGoalScope,
        clearGoalScope,
    };
}

export default useSessionDetailUiState;
