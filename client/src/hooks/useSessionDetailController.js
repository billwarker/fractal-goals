import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useActiveSessionActions, useActiveSessionData, useActiveSessionUi } from '../contexts/ActiveSessionContext';
import { useActiveSession } from './useSessionQueries';
import { useActivityTagCatalog } from './useActivityTagCatalog';
import { useGoalActivities } from './useGoalQueries';
import useSessionOptionsMutations from './useSessionOptionsMutations';
import { useSessionDetailGoalAssociations } from './useSessionDetailGoalAssociations';
import useSessionDetailNotes from './useSessionDetailNotes';
import useSessionDetailUiState from './useSessionDetailUiState';
import useSequenceAdvanceUndo from './useSequenceAdvanceUndo';
import useSessionSidePaneViewModel from './useSessionSidePaneViewModel';

export function useSessionDetailController({ rootId, sessionId, navigate, isMobile }) {
    // The catalog must be available after an offline reload, before a picker is first opened.
    useActivityTagCatalog(rootId);
    const { user } = useAuth();
    const activeSessionQuery = useActiveSession(user?.id, rootId);
    const {
        session,
        activities,
        activityGroups,
        activityInstances,
        loading,
        autoSaveStatus,
        localSessionData,
        calculateTotalDuration,
        sessionGoalsView,
    } = useActiveSessionData();
    useSequenceAdvanceUndo({ rootId, goalTree: sessionGoalsView?.goal_tree });
    const {
        updateGoal,
        toggleGoalCompletion,
        addActivity,
        deleteSession,
        pauseSession,
        resumeSession,
    } = useActiveSessionActions();
    const { sidePaneMode, setSidePaneMode: setSidePaneModeUi } = useActiveSessionUi();
    const {
        isSavingTemplate,
        isDuplicatingSession,
        createTemplateFromSession,
        duplicateSession,
    } = useSessionOptionsMutations(rootId, sessionId);

    const {
        showDeleteConfirm,
        setShowDeleteConfirm,
        showBuilder,
        builderActivity,
        builderInitialGoalIds,
        selectedGoal,
        setSelectedGoal,
        selectedActivity: selectedActivityDraft,
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
    } = useSessionDetailUiState({
        rootId,
        sessionId,
        isMobile,
        addActivity,
        setSidePaneMode: setSidePaneModeUi,
    });

    const selectedActivity = activityInstances.find((instance) => instance.id === selectedActivityDraft?.id) || selectedActivityDraft;

    const {
        data: scopedGoalActivities = [],
        isLoading: isGoalScopeLoading,
        isError: isGoalScopeError,
        refetch: retryGoalScope,
    } = useGoalActivities(rootId, scopedGoal?.id);

    const activityGoalScope = useMemo(() => {
        if (!scopedGoal) return null;
        return {
            goal: scopedGoal,
            activityIds: scopedGoalActivities.map((activity) => String(activity.id)),
            isLoading: isGoalScopeLoading,
            isError: isGoalScopeError,
            onRetry: retryGoalScope,
            onClear: clearGoalScope,
        };
    }, [clearGoalScope, isGoalScopeError, isGoalScopeLoading, retryGoalScope, scopedGoal, scopedGoalActivities]);

    const {
        allAvailableGoals,
        handleAssociateActivity,
        handleGoalHierarchyChanged,
        handleGoalAssociationsChanged,
    } = useSessionDetailGoalAssociations({
        rootId,
        sessionId,
        showAssociationModal,
        associationContext,
        setAssociationContext,
    });

    const {
        notes: sessionNotes,
        previousNotes,
        previousSessionNotes,
        addNote,
        updateNote,
        deleteNote,
        refreshNotes,
    } = useSessionDetailNotes({
        rootId,
        sessionId,
        selectedActivity,
        updateGoal,
    });

    const handleConfirmDelete = async () => {
        await deleteSession();
        navigate(`/${rootId}/sessions`, {
            state: { deletedSessionId: sessionId, deletedAt: Date.now() }
        });
    };

    const handleCreateTemplate = async (name) => {
        const createdTemplate = await createTemplateFromSession(name);
        setShowOptionsModal(false);
        return createdTemplate;
    };

    const canDuplicateSession = Boolean(
        (session?.completed ?? session?.attributes?.completed)
        && activeSessionQuery.isSuccess
        && !activeSessionQuery.data
    );

    const handleDuplicateSession = async () => {
        if (!canDuplicateSession) return;
        const duplicatedSession = await duplicateSession();
        setShowOptionsModal(false);
        navigate(`/${rootId}/session/${duplicatedSession.id}`);
        return duplicatedSession;
    };

    const handlePauseResume = async () => {
        if (session?.is_paused) {
            return resumeSession();
        }
        return pauseSession();
    };

    const handleDeleteSessionRequest = () => {
        setShowOptionsModal(false);
        setShowDeleteConfirm(true);
    };

    const sidePaneModel = useSessionSidePaneViewModel({
        selectedActivity,
        selectedSetIndex,
        onNoteAdded: refreshNotes,
        onGoalClick: setSelectedGoal,
        onGoalCreated: handleGoalHierarchyChanged,
        notes: sessionNotes,
        previousNotes,
        previousSessionNotes,
        addNote,
        updateNote,
        deleteNote,
        onOptions: () => setShowOptionsModal(true),
        mode: sidePaneMode,
        onModeChange: setSidePaneModeUi,
        activityGoalScope,
        onGoalScopeToggle: handleToggleGoalScope,
    });

    return {
        session,
        activities,
        activityGroups,
        activityInstances,
        loading,
        autoSaveStatus,
        sidePaneMode,
        setSidePaneMode: setSidePaneModeUi,
        localSessionData,
        updateGoal,
        toggleGoalCompletion,
        calculateTotalDuration,
        showDeleteConfirm,
        setShowDeleteConfirm,
        showBuilder,
        builderActivity,
        builderInitialGoalIds,
        selectedGoal,
        setSelectedGoal,
        selectedActivity,
        selectedSetIndex,
        showAssociationModal,
        setShowAssociationModal,
        associationContext,
        isMobilePaneOpen,
        setIsMobilePaneOpen,
        allAvailableGoals,
        sessionNotes,
        previousNotes,
        previousSessionNotes,
        sidePaneModel,
        addNote,
        updateNote,
        deleteNote,
        refreshNotes,
        handleActivityFocus,
        handleOpenGoals,
        handleAssociateActivity,
        handleGoalHierarchyChanged,
        handleGoalAssociationsChanged,
        handleOpenActivityBuilder,
        handleCloseActivityBuilder,
        handleActivityCreated,
        handleConfirmDelete,
        showOptionsModal,
        setShowOptionsModal,
        handleCreateTemplate,
        handleDuplicateSession,
        canDuplicateSession,
        handlePauseResume,
        handleDeleteSessionRequest,
        isSavingTemplate,
        isDuplicatingSession,
        activityGoalScope,
    };
}
