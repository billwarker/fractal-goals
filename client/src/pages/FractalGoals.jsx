import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FractalView from '../components/FractalView';
import Sidebar from '../components/Sidebar';
import ErrorBoundary from '../components/ErrorBoundary';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import GoalDetailModal from '../components/GoalDetailModal';
import AlertModal from '../components/modals/AlertModal';
import { useGoals } from '../contexts/GoalsContext';
import { useSessions } from '../contexts/SessionsContext';
import { useActivities } from '../contexts/ActivitiesContext';
import { getChildType } from '../utils/goalHelpers';
import '../App.css';
import './FractalGoals.css';

/**
 * FractalGoals Page - FlowTree visualization with sidebar
 * 
 * NOTE: Sessions are NO LONGER displayed in the goal tree.
 * They are managed separately via the /sessions page.
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
        sessions,
        fetchSessions,
        loading: sessionsLoading
    } = useSessions();

    const {
        activities,
        activityGroups,
        fetchActivities,
        fetchActivityGroups
    } = useActivities();

    // Programs State
    const [programs, setPrograms] = useState([]);
    const [programsLoading, setProgramsLoading] = useState(false);

    const fetchPrograms = async (id) => {
        try {
            setProgramsLoading(true);
            const { fractalApi } = await import('../utils/api');
            const res = await fractalApi.getPrograms(id);
            setPrograms(res.data || []);
        } catch (err) {
            console.error("Failed to fetch programs:", err);
        } finally {
            setProgramsLoading(false);
        }
    };

    const loading = goalsLoading;

    // Sidebar state
    const [sidebarMode, setSidebarMode] = useState(null);
    const [viewingGoal, setViewingGoal] = useState(null);

    // Modal state
    const [showGoalModal, setShowGoalModal] = useState(false);
    const [selectedParent, setSelectedParent] = useState(null);
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
        fetchActivityGroups(rootId);
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

        if (updatedGoal && updatedGoal !== viewingGoal) {
            setViewingGoal(updatedGoal);
        }
    }, [fractalData, viewingGoal]);

    // Helper to show alert
    const showAlert = (title, message) => {
        setAlertData({ isOpen: true, title, message });
    };

    // Handlers

    const handleGoalNameClick = (nodeDatum) => {
        setViewingGoal(nodeDatum);
        setSidebarMode('goal-details');
    };

    const handleAddChildClick = (nodeDatum) => {
        const parentType = nodeDatum.attributes?.type || nodeDatum.type;
        const childType = getChildType(parentType);

        if (!childType) {
            showAlert('Notice', 'This goal type cannot have children.');
            return;
        }

        // Show the Goal creation modal
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

    const handleUpdateNode = async (payload) => {
        try {
            const nodeId = viewingGoal.id || viewingGoal.attributes?.id;
            const updated = await updateGoal(rootId, String(nodeId), payload);
            setViewingGoal(updated);
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
            await deleteGoal(rootId, fractalToDelete.id);

            setFractalToDelete(null);
            setSidebarMode(null);
            setViewingGoal(null);
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
                    onNodeClick={handleGoalNameClick}
                    selectedNodeId={viewingGoal ? (viewingGoal.attributes?.id || viewingGoal.id) : null}
                    onAddChild={handleAddChildClick}
                    sidebarOpen={!!sidebarMode}
                    key={rootId} // Force refresh on root switch
                />
            </div>

            {/* Sidebar */}
            {sidebarMode && (
                <ErrorBoundary>
                    <Sidebar
                        selectedNode={viewingGoal}
                        selectedRootId={rootId}
                        onClose={() => {
                            setSidebarMode(null);
                            setViewingGoal(null);
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
                        sessions={sessions}
                        activityDefinitions={activities}
                        activityGroups={activityGroups}
                        programs={programs}
                    />
                </ErrorBoundary>
            )}

            {/* Modals */}
            <GoalDetailModal
                isOpen={showGoalModal}
                onClose={() => setShowGoalModal(false)}
                mode="create"
                onCreate={handleCreateGoal}
                parentGoal={selectedParent}
                activityDefinitions={activities}
                activityGroups={activityGroups}
                rootId={rootId}
            />

            <DeleteConfirmModal
                isOpen={!!fractalToDelete}
                onClose={() => setFractalToDelete(null)}
                onConfirm={handleDelete}
                title="Delete Goal?"
                message={`Are you sure you want to delete "${fractalToDelete?.name}" and all its children?`}
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
