import { useActiveSessionActions, useActiveSessionData, useActiveSessionUi } from '../contexts/ActiveSessionContext';
import useSessionOptionsMutations from './useSessionOptionsMutations';
import { useSessionDetailGoalAssociations } from './useSessionDetailGoalAssociations';
import useSessionDetailNotes from './useSessionDetailNotes';
import useSessionDetailUiState from './useSessionDetailUiState';
import useSessionSidePaneViewModel from './useSessionSidePaneViewModel';

export function useSessionDetailController({ rootId, sessionId, navigate, isMobile }) {
    const {
        session,
        activities,
        activityGroups,
        activityInstances,
        loading,
        autoSaveStatus,
        localSessionData,
        calculateTotalDuration,
    } = useActiveSessionData();
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
    } = useSessionDetailUiState({
        isMobile,
        addActivity,
        setSidePaneMode: setSidePaneModeUi,
    });

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

    const handleDuplicateSession = async () => {
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
        handlePauseResume,
        handleDeleteSessionRequest,
        isSavingTemplate,
        isDuplicatingSession,
    };
}
