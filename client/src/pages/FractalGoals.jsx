import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FractalView from '../components/FractalView';
import Sidebar from '../components/Sidebar';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import GoalDetailModal from '../components/GoalDetailModal';
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

    // Programs State
    const [programs, setPrograms] = useState([]);
    const [programsLoading, setProgramsLoading] = useState(false);

    const fetchPrograms = async (id) => {
        try {
            setProgramsLoading(true);
            const { fractalApi } = await import('../utils/api'); // Dynamic import to avoid circular dep issues if any
            const res = await fractalApi.getPrograms(id);
            setPrograms(res.data || []);
        } catch (err) {
            console.error("Failed to fetch programs:", err);
            // Non-critical, just log
        } finally {
            setProgramsLoading(false);
        }
    };

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
        fetchPrograms(rootId);
    }, [rootId, navigate]);

    // Sync viewingGoal with fractalData updates (e.g. when completion status changes)
    useEffect(() => {
        if (!fractalData || !viewingGoal) return;

        // Recursive helper to find goal in tree
        const findGoal = (node, targetId) => {
            const nodeId = node.attributes?.id || node.id;
            if (nodeId === targetId) return node;

            if (node.children) {
                for (const child of node.children) {
                    const found = findGoal(child, targetId);
                    if (found) return found;
                }
            }
            return null;
        };

        const viewingId = viewingGoal.attributes?.id || viewingGoal.id;
        const updatedGoal = findGoal(fractalData, viewingId);

        // Only update if we found it and it's different (shallow check of attributes helps avoid loops if implemented carefully, 
        // but since we're setting a new object reference, we rely on React's equality check or the fact that fractalData reference changes only on update)
        if (updatedGoal && updatedGoal !== viewingGoal) {
            setViewingGoal(updatedGoal);
        }
    }, [fractalData, viewingGoal]);

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

        // If adding a Practice Session to a ShortTermGoal, redirect to CREATE SESSION page
        if (parentType === 'ShortTermGoal' && childType === 'PracticeSession') {
            const goalId = nodeDatum.id || nodeDatum.attributes?.id;
            navigate(`/${rootId}/create-session?goalId=${goalId}`);
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
                    onAddSession={() => {
                        const goalId = viewingGoal?.id || viewingGoal?.attributes?.id;
                        navigate(`/${rootId}/create-session?goalId=${goalId}`);
                    }}
                    onToggleCompletion={handleToggleCompletion}
                    treeData={fractalData}
                    practiceSessions={practiceSessions}
                    activityDefinitions={activities}
                    programs={programs}
                />
            )}

            {/* Modals */}
            <GoalDetailModal
                isOpen={showGoalModal}
                onClose={() => setShowGoalModal(false)}
                mode="create"
                onCreate={handleCreateGoal}
                parentGoal={selectedParent}
                activityDefinitions={activities}
                rootId={rootId}
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
