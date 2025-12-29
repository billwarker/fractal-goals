import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FractalView from '../components/FractalView';
import Sidebar from '../components/Sidebar';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import GoalModal from '../components/modals/GoalModal';
import PracticeSessionModal from '../components/modals/PracticeSessionModal';
import { useGoals } from '../contexts/GoalsContext';
import { useSessions } from '../contexts/SessionsContext';
import { useActivities } from '../contexts/ActivitiesContext';
import { getChildType, collectShortTermGoals } from '../utils/goalHelpers';
import '../App.css';

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
            alert('This goal type cannot have children.');
            return;
        }

        // If adding a Practice Session to a ShortTermGoal, use Practice Session Modal
        if (parentType === 'ShortTermGoal' && childType === 'PracticeSession') {
            // Optionally pre-select the goal? The modal expects a list. 
            // We'll just open the modal for now.
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
            alert('Error creating goal: ' + err.message);
        }
    };

    const handleCreateSession = async (sessionData) => {
        try {
            const payload = {
                name: "Auto-Generated", // Backend might override or we let user edit later
                description: `Practice session with ${sessionData.immediateGoals.length} immediate goal(s)`,
                parent_ids: sessionData.selectedShortTermGoals,
                immediate_goals: sessionData.immediateGoals
            };

            await createSession(rootId, payload);
            setShowPracticeSessionModal(false);
        } catch (err) {
            alert('Error creating practice session: ' + err.message);
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
            alert('Failed to update: ' + err.message);
        }
    };

    const handleToggleCompletion = async (goalId, currentStatus) => {
        try {
            await toggleGoalCompletion(rootId, goalId, !currentStatus);
            // Updating view state handled by context refreshing tree? 
            // If viewingGoal is the one toggled, we might need to update it locally or wait for re-render.
            // FractalView will re-render with new data. 
            // Sidebar viewingGoal ref might need update if it relies on 'viewingGoal' state being fresh.
            // But 'viewingGoal' is just a reference or snapshot? 
            // Ideally we re-fetch or find the goal in the new tree.
            // For now, next re-render of FractalView updates graph, but Sidebar might show stale data unless we update viewingGoal.
            // We can assume context fetch updates 'currentFractal'.
        } catch (err) {
            alert('Error updating completion: ' + err.message);
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
            alert('Failed to delete: ' + err.message);
        }
    };


    if (loading || !fractalData) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <p>Loading fractal data...</p>
            </div>
        );
    }

    return (
        <div className="fractal-goals-page" style={{ display: 'flex', height: '100%', position: 'relative' }}>
            {/* Main Content - FlowTree */}
            <div style={{ flex: 1, position: 'relative' }}>
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
                onDelete={handleDelete}
                title={`Delete ${fractalToDelete?.attributes?.type === 'PracticeSession' ? 'Session' : 'Goal'}?`}
                message={`Are you sure you want to delete "${fractalToDelete?.name}"?`}
                isDeleting={false} // Loading state could be added
            />
        </div>
    );
}

export default FractalGoals;
