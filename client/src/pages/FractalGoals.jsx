import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FractalView from '../components/FractalView';
import Sidebar from '../components/Sidebar';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import GoalModal from '../components/modals/GoalModal';
import PracticeSessionModal from '../components/modals/PracticeSessionModal';
import AlertModal from '../components/modals/AlertModal';
import { useGoals } from '../contexts/GoalsContext';
import { useSessions } from '../contexts/SessionsContext';
import { useActivities } from '../contexts/ActivitiesContext';
import { getChildType, collectShortTermGoals } from '../utils/goalHelpers';
import '../App.css';
import './FractalGoals.css';

/**
 * FractalGoals Page - FlowTree visualization with sidebar
 */
function FractalGoals() {
    const { rootId } = useParams();
    const navigate = useNavigate();

    // Contexts
    const {
        currentFractal: fractalData,
        fetchFractalTree,
        createGoal,
        updateGoal,
        deleteGoal,
        toggleGoalCompletion,
        loading: goalsLoading
    } = useGoals();

    const {
        sessions: practiceSessions,
        fetchSessions,
        updateSession,
        createSession,
        deleteSession,
        loading: sessionsLoading
    } = useSessions();

    const {
        activities,
        fetchActivities
    } = useActivities();

    const loading = goalsLoading || sessionsLoading;

    // Sidebar state
    const [sidebarMode, setSidebarMode] = useState(null);
    const [viewingGoal, setViewingGoal] = useState(null);
    const [viewingPracticeSession, setViewingPracticeSession] = useState(null);

    // Modal state
    const [showGoalModal, setShowGoalModal] = useState(false);
    const [selectedParent, setSelectedParent] = useState(null);
    const [showPracticeSessionModal, setShowPracticeSessionModal] = useState(false);
    const [fractalToDelete, setFractalToDelete] = useState(null);

    // Alert state
    const [alertData, setAlertData] = useState({ isOpen: false, title: '', message: '' });

    // Initial Data Fetch
    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchFractalTree(rootId);
        fetchSessions(rootId);
        fetchActivities(rootId);
    }, [rootId, navigate]);

    // Derived Data
    const shortTermGoals = fractalData ? collectShortTermGoals(fractalData) : [];

    // Helper to show alert
    const showAlert = (title, message) => {
        setAlertData({ isOpen: true, title, message });
    };

    // Handlers

    const handleGoalNameClick = (nodeDatum) => {
        const isPracticeSession = nodeDatum.attributes?.type === 'PracticeSession' ||
            nodeDatum.type === 'PracticeSession' ||
            nodeDatum.__isPracticeSession;

        if (isPracticeSession) {
            setViewingPracticeSession(nodeDatum);
            setSidebarMode('session-details');
        } else {
            setViewingGoal(nodeDatum);
            setSidebarMode('goal-details');
        }
    };

    const handleAddChildClick = (nodeDatum) => {
        const parentType = nodeDatum.attributes?.type || nodeDatum.type;
        const childType = getChildType(parentType);

        if (!childType) {
            showAlert('Notice', 'This goal type cannot have children.');
            return;
        }

        // If adding a Practice Session to a ShortTermGoal, use Practice Session Modal
        if (parentType === 'ShortTermGoal' && childType === 'PracticeSession') {
            setShowPracticeSessionModal(true);
            return;
        }

        // Otherwise, show the Goal creation modal
        setSelectedParent(nodeDatum);
        setShowGoalModal(true);
    };

    const handleCreateGoal = async (goalData) => {
        try {
            await createGoal(rootId, goalData);
            setShowGoalModal(false);
        } catch (err) {
            showAlert('Creation Failed', 'Error creating goal: ' + err.message);
        }
    };

    const handleCreateSession = async (sessionData) => {
        try {
            const payload = {
                name: "Auto-Generated",
                description: `Practice session with ${sessionData.immediateGoals.length} immediate goal(s)`,
                parent_ids: sessionData.selectedShortTermGoals,
                immediate_goals: sessionData.immediateGoals
            };

            await createSession(rootId, payload);
            setShowPracticeSessionModal(false);
        } catch (err) {
            showAlert('Creation Failed', 'Error creating practice session: ' + err.message);
        }
    };

    const handleUpdateNode = async (payload) => {
        try {
            const target = sidebarMode === 'session-details' ? viewingPracticeSession : viewingGoal;
            const nodeId = target.id || target.attributes?.id;

            if (sidebarMode === 'session-details') {
                const updated = await updateSession(rootId, String(nodeId), payload);
                setViewingPracticeSession(updated);
            } else {
                const updated = await updateGoal(rootId, String(nodeId), payload);
                setViewingGoal(updated);
            }
        } catch (err) {
            showAlert('Update Failed', 'Failed to update: ' + err.message);
        }
    };

    const handleToggleCompletion = async (goalId, currentStatus) => {
        try {
            await toggleGoalCompletion(rootId, goalId, !currentStatus);
        } catch (err) {
            showAlert('Update Failed', 'Error updating completion: ' + err.message);
        }
    };

    const handleDelete = async () => {
        if (!fractalToDelete) return;

        try {
            const isSession = fractalToDelete.attributes?.type === 'PracticeSession' ||
                fractalToDelete.type === 'PracticeSession';

            if (isSession) {
                await deleteSession(rootId, fractalToDelete.id);
            } else {
                await deleteGoal(rootId, fractalToDelete.id);
            }

            setFractalToDelete(null);
            setSidebarMode(null);
            setViewingGoal(null);
            setViewingPracticeSession(null);
        } catch (err) {
            showAlert('Deletion Failed', 'Failed to delete: ' + err.message);
        }
    };


    if (loading || !fractalData) {
        return (
            <div className="loading-container">
                <p className="loading-text">Loading fractal data...</p>
            </div>
        );
    }

    return (
        <div className="fractal-page-container">
            {/* Main Content - FlowTree */}
            <div className="fractal-view-wrapper">
                <FractalView
                    treeData={fractalData}
                    practiceSessions={practiceSessions}
                    onNodeClick={handleGoalNameClick}
                    selectedNodeId={
                        viewingGoal ? (viewingGoal.attributes?.id || viewingGoal.id) :
                            viewingPracticeSession ? (viewingPracticeSession.attributes?.id || viewingPracticeSession.id) :
                                null
                    }
                    onAddPracticeSession={() => setShowPracticeSessionModal(true)}
                    onAddChild={handleAddChildClick}
                    sidebarOpen={!!sidebarMode}
                    key={rootId} // Force refresh on root switch
                />
            </div>

            {/* Sidebar */}
            {sidebarMode && (
                <Sidebar
                    selectedNode={sidebarMode === 'session-details' ? viewingPracticeSession : viewingGoal}
                    selectedRootId={rootId}
                    onClose={() => {
                        setSidebarMode(null);
                        setViewingGoal(null);
                        setViewingPracticeSession(null);
                    }}
                    onUpdate={handleUpdateNode}
                    onDelete={(node) => setFractalToDelete(node)}
                    onAddChild={handleAddChildClick}
                    onAddSession={() => setShowPracticeSessionModal(true)}
                    onToggleCompletion={(node) => {
                        const goalId = node.attributes?.id || node.id;
                        const currentStatus = node.attributes?.completed || false;
                        handleToggleCompletion(goalId, currentStatus);
                    }}
                    treeData={fractalData}
                    practiceSessions={practiceSessions}
                    activityDefinitions={activities}
                />
            )}

            {/* Modals */}
            <GoalModal
                isOpen={showGoalModal}
                onClose={() => setShowGoalModal(false)}
                onSubmit={handleCreateGoal}
                parent={selectedParent}
            />

            <PracticeSessionModal
                isOpen={showPracticeSessionModal}
                onClose={() => setShowPracticeSessionModal(false)}
                onSubmit={handleCreateSession}
                shortTermGoals={shortTermGoals}
            />

            <DeleteConfirmModal
                isOpen={!!fractalToDelete}
                onClose={() => setFractalToDelete(null)}
                onConfirm={handleDelete}
                title={`Delete ${fractalToDelete?.attributes?.type === 'PracticeSession' ? 'Session' : 'Goal'}?`}
                message={`Are you sure you want to delete "${fractalToDelete?.name}"?`}
            />

            <AlertModal
                isOpen={alertData.isOpen}
                onClose={() => setAlertData({ ...alertData, isOpen: false })}
                title={alertData.title}
                message={alertData.message}
            />
        </div>
    );
}

export default FractalGoals;
