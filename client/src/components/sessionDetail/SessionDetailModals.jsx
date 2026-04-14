import React, { Suspense } from 'react';

import ConfirmationModal from '../ConfirmationModal';
import SessionOptionsModal from './SessionOptionsModal';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const ActivityBuilder = lazyWithRetry(() => import('../ActivityBuilder'), 'components/ActivityBuilder');
const GoalDetailModal = lazyWithRetry(() => import('../GoalDetailModal'), 'components/GoalDetailModal');
const ActivityAssociationModal = lazyWithRetry(() => import('./ActivityAssociationModal'), 'components/sessionDetail/ActivityAssociationModal');

function SessionDetailModals({
    rootId,
    activities,
    showDeleteConfirm,
    onCloseDeleteConfirm,
    onConfirmDelete,
    showBuilder,
    builderActivity,
    onCloseBuilder,
    onActivityCreated,
    selectedGoal,
    onCloseGoal,
    onUpdateGoal,
    onToggleGoalCompletion,
    onGoalAssociationsChanged,
    showAssociationModal,
    onCloseAssociationModal,
    associationContext,
    allAvailableGoals,
    onAssociateActivity,
    showOptionsModal,
    onCloseOptionsModal,
    sessionName,
    onCreateTemplate,
    onDuplicateSession,
    isSavingTemplate,
    isDuplicatingSession,
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

            {showBuilder && (
                <Suspense fallback={null}>
                    <ActivityBuilder
                        isOpen={showBuilder}
                        onClose={onCloseBuilder}
                        editingActivity={builderActivity}
                        rootId={rootId}
                        onSave={onActivityCreated}
                    />
                </Suspense>
            )}

            {!!selectedGoal && (
                <Suspense fallback={null}>
                    <GoalDetailModal
                        isOpen={Boolean(selectedGoal)}
                        onClose={onCloseGoal}
                        goal={selectedGoal}
                        onUpdate={onUpdateGoal}
                        onToggleCompletion={onToggleGoalCompletion}
                        activityDefinitions={activities}
                        rootId={rootId}
                        onAssociationsChanged={onGoalAssociationsChanged}
                    />
                </Suspense>
            )}

            {showAssociationModal && (
                <Suspense fallback={null}>
                    <ActivityAssociationModal
                        key={`${associationContext?.activityDefinition?.id || 'none'}:${(associationContext?.initialSelectedGoalIds || []).join(',')}`}
                        isOpen={showAssociationModal}
                        onClose={onCloseAssociationModal}
                        onAssociate={onAssociateActivity}
                        initialActivityName={associationContext?.activityDefinition?.name}
                        initialSelectedGoalIds={associationContext?.initialSelectedGoalIds || []}
                        goals={allAvailableGoals}
                    />
                </Suspense>
            )}

            <SessionOptionsModal
                isOpen={showOptionsModal}
                onClose={onCloseOptionsModal}
                sessionName={sessionName}
                onCreateTemplate={onCreateTemplate}
                onDuplicateSession={onDuplicateSession}
                isSavingTemplate={isSavingTemplate}
                isDuplicatingSession={isDuplicatingSession}
            />
        </>
    );
}

export default SessionDetailModals;
