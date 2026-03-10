import React, { Suspense, lazy } from 'react';

import ConfirmationModal from '../ConfirmationModal';

const ActivityBuilder = lazy(() => import('../ActivityBuilder'));
const GoalDetailModal = lazy(() => import('../GoalDetailModal'));
const ActivityAssociationModal = lazy(() => import('./ActivityAssociationModal'));

function SessionDetailModals({
    rootId,
    activities,
    showDeleteConfirm,
    onCloseDeleteConfirm,
    onConfirmDelete,
    showBuilder,
    onCloseBuilder,
    onActivityCreated,
    selectedGoal,
    onCloseGoal,
    onUpdateGoal,
    onGoalAssociationsChanged,
    showAssociationModal,
    onCloseAssociationModal,
    associationContext,
    allAvailableGoals,
    onAssociateActivity,
}) {
    return (
        <>
            <ConfirmationModal
                isOpen={showDeleteConfirm}
                onClose={onCloseDeleteConfirm}
                onConfirm={onConfirmDelete}
                title="Delete Session"
                message="Are you sure you want to delete this session? This action cannot be undone."
                confirmText="Delete"
            />

            <Suspense fallback={null}>
                {(showBuilder || !!selectedGoal || showAssociationModal) && (
                    <>
                        <ActivityBuilder
                            isOpen={showBuilder}
                            onClose={onCloseBuilder}
                            rootId={rootId}
                            onSave={onActivityCreated}
                        />

                        {!!selectedGoal && (
                            <GoalDetailModal
                                isOpen={Boolean(selectedGoal)}
                                onClose={onCloseGoal}
                                goal={selectedGoal}
                                onUpdate={onUpdateGoal}
                                activityDefinitions={activities}
                                rootId={rootId}
                                onAssociationsChanged={onGoalAssociationsChanged}
                            />
                        )}

                        <ActivityAssociationModal
                            key={`${associationContext?.activityDefinition?.id || 'none'}:${(associationContext?.initialSelectedGoalIds || []).join(',')}`}
                            isOpen={showAssociationModal}
                            onClose={onCloseAssociationModal}
                            onAssociate={onAssociateActivity}
                            initialActivityName={associationContext?.activityDefinition?.name}
                            initialSelectedGoalIds={associationContext?.initialSelectedGoalIds || []}
                            goals={allAvailableGoals}
                        />
                    </>
                )}
            </Suspense>
        </>
    );
}

export default SessionDetailModals;
