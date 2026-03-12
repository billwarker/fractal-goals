import { useEffect, useState } from 'react';

export function useSessionDetailUiState({ isMobile, addActivity, setSidePaneMode }) {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showBuilder, setShowBuilder] = useState(false);
    const [builderActivity, setBuilderActivity] = useState(null);
    const [sectionForNewActivity, setSectionForNewActivity] = useState(null);
    const [selectedGoal, setSelectedGoal] = useState(null);
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [selectedSetIndex, setSelectedSetIndex] = useState(null);
    const [showAssociationModal, setShowAssociationModal] = useState(false);
    const [associationContext, setAssociationContext] = useState(null);
    const [isMobilePaneOpen, setIsMobilePaneOpen] = useState(false);

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
        setSidePaneMode('goals');
        if (isMobile) setIsMobilePaneOpen(true);
    };

    const handleOpenActivityBuilder = (sectionIndex, activityDefinition = null) => {
        setSectionForNewActivity(sectionIndex);
        setBuilderActivity(activityDefinition);
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
    };
}

export default useSessionDetailUiState;
