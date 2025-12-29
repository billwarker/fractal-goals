import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FractalView from '../components/FractalView';
import { useGoals } from '../contexts/GoalsContext';
import { useSessions } from '../contexts/SessionsContext';
import { useActivities } from '../contexts/ActivitiesContext';
import TargetCard from '../components/TargetCard';
import AddTargetModal from '../components/AddTargetModal';
import { getAchievedTargetsForSession } from '../utils/targetUtils';
import '../App.css';

// Helper functions
const getChildType = (parentType) => {
    const map = {
        'UltimateGoal': 'LongTermGoal',
        'LongTermGoal': 'MidTermGoal',
        'MidTermGoal': 'ShortTermGoal',
        'ShortTermGoal': 'PracticeSession',
        'PracticeSession': 'ImmediateGoal',
        'ImmediateGoal': 'MicroGoal',
        'MicroGoal': 'NanoGoal',
        'NanoGoal': null
    };
    return map[parentType];
};

const getTypeDisplayName = (type) => {
    const names = {
        'UltimateGoal': 'Ultimate Goal',
        'LongTermGoal': 'Long Term Goal',
        'MidTermGoal': 'Mid Term Goal',
        'ShortTermGoal': 'Short Term Goal',
        'PracticeSession': 'Practice Session',
        'ImmediateGoal': 'Immediate Goal',
        'MicroGoal': 'Micro Goal',
        'NanoGoal': 'Nano Goal'
    };
    return names[type] || type;
};

const calculateGoalAge = (createdAt) => {
    if (!createdAt) return null;
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays >= 365) {
        return `${(diffDays / 365).toFixed(1)}y`;
    } else if (diffDays >= 30 || diffDays > 7) {
        return `${(diffDays / 30.44).toFixed(1)}mo`;
    } else if (diffDays > 6) {
        return `${(diffDays / 7).toFixed(1)}w`;
    } else {
        return `${Math.floor(diffDays)}d`;
    }
};

const calculateDueTime = (deadline) => {
    if (!deadline) return null;
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const diffMs = deadlineDate - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // If past deadline, show negative
    const isPast = diffDays < 0;
    const absDays = Math.abs(diffDays);

    let timeStr;
    if (absDays >= 365) {
        timeStr = `${(absDays / 365).toFixed(1)}y`;
    } else if (absDays >= 30 || absDays > 7) {
        timeStr = `${(absDays / 30.44).toFixed(1)}mo`;
    } else if (absDays > 6) {
        timeStr = `${(absDays / 7).toFixed(1)}w`;
    } else {
        timeStr = `${Math.floor(absDays)}d`;
    }

    return isPast ? `-${timeStr}` : timeStr;
};



const collectShortTermGoals = (node, collected = []) => {
    if (!node) return collected;
    const type = node.attributes?.type || node.type;
    if (type === 'ShortTermGoal') {
        collected.push({
            id: node.attributes?.id || node.id,
            name: node.name
        });
    }
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => collectShortTermGoals(child, collected));
    }
    return collected;
};

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
        loading: sessionsLoading
    } = useSessions();

    const {
        activities,
        fetchActivities
    } = useActivities();

    const loading = goalsLoading || sessionsLoading;

    // Local UI State
    const [selectedPracticeSession, setSelectedPracticeSession] = useState(null);

    // Sidebar state
    const [sidebarMode, setSidebarMode] = useState(null);
    const [viewingGoal, setViewingGoal] = useState(null);
    const [viewingPracticeSession, setViewingPracticeSession] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', description: '', deadline: '' });

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [selectedParent, setSelectedParent] = useState(null);
    const [showPracticeSessionModal, setShowPracticeSessionModal] = useState(false);
    const [selectedShortTermGoals, setSelectedShortTermGoals] = useState([]);
    const [immediateGoals, setImmediateGoals] = useState([{ name: '', description: '' }]);
    const [fractalToDelete, setFractalToDelete] = useState(null);

    // Form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [deadline, setDeadline] = useState('');
    const [goalType, setGoalType] = useState('UltimateGoal');

    // Targets state
    const [showTargetModal, setShowTargetModal] = useState(false);
    const [editingTarget, setEditingTarget] = useState(null);
    const [editedTargets, setEditedTargets] = useState([]);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchFractalTree(rootId);
        fetchSessions(rootId);
        fetchActivities(rootId);
    }, [rootId, navigate]);

    // Cleanup fetch functions - no longer needed as we use context methods directly
    const fetchGoals = async () => {
        await fetchFractalTree(rootId);
        await fetchSessions(rootId);
    };

    const handleGoalNameClick = (nodeDatum) => {
        const isPracticeSession = nodeDatum.attributes?.type === 'PracticeSession' || nodeDatum.type === 'PracticeSession' || nodeDatum.__isPracticeSession;

        if (isPracticeSession) {
            setViewingPracticeSession(nodeDatum);
            setSidebarMode('session-details');
            setIsEditing(false);
        } else {
            setViewingGoal(nodeDatum);
            setSidebarMode('goal-details');
            setIsEditing(false);
        }
    };

    const handleAddChildClick = (nodeDatum) => {
        const parentType = nodeDatum.attributes?.type || nodeDatum.type;
        const childType = getChildType(parentType);
        if (!childType) {
            alert('This goal type cannot have children.');
            return;
        }

        // If adding a Practice Session to a ShortTermGoal, redirect to create-practice-session page
        if (parentType === 'ShortTermGoal' && childType === 'PracticeSession') {
            const goalId = nodeDatum.attributes?.id || nodeDatum.id;
            navigate(`/${rootId}/create-practice-session?goalId=${goalId}`);
            return;
        }

        // Otherwise, show the modal
        setSelectedParent(nodeDatum);
        setGoalType(childType);
        setShowModal(true);
    };

    const handleEditClick = () => {
        setIsEditing(true);
        const target = sidebarMode === 'session-details' ? viewingPracticeSession : viewingGoal;
        setEditForm({
            name: target.name || '',
            description: target.attributes?.description || target.description || '',
            deadline: target.attributes?.deadline || target.deadline || ''
        });

        // Initialize editedTargets with current targets
        if (sidebarMode === 'goal-details') {
            setEditedTargets(target.attributes?.targets || []);
        }
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditedTargets([]); // Clear edited targets on cancel
    };

    const handleSaveEdit = async () => {
        try {
            const target = sidebarMode === 'session-details' ? viewingPracticeSession : viewingGoal;
            const goalId = target.id || target.attributes?.id;

            const payload = { ...editForm };
            if (payload.deadline === '') {
                payload.deadline = null;
            } else if (payload.deadline) {
                // Strip time portion to match backend format (YYYY-MM-DD)
                payload.deadline = payload.deadline.split('T')[0];
            }

            // Include targets in payload for goals
            if (sidebarMode === 'goal-details') {
                payload.targets = editedTargets;
                // Update via Context
                const updated = await updateGoal(rootId, String(goalId), payload);
                setViewingGoal(updated);
            } else {
                // Session via Context
                const updated = await updateSession(rootId, String(goalId), payload);
                setViewingPracticeSession(updated);
            }

            setIsEditing(false);
            setEditedTargets([]); // Clear edited targets after save
        } catch (error) {
            alert('Failed to update: ' + error.message);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                name,
                description,
                type: goalType,
                parent_id: selectedParent ? (selectedParent.attributes?.id || selectedParent.id) : null,
                deadline: deadline || null
            };

            await createGoal(rootId, payload);
            setShowModal(false);
            setName('');
            setDescription('');
            setDeadline('');
            // Context auto-refreshes
        } catch (err) {
            alert('Error creating goal: ' + err.message);
        }
    };

    const handleToggleCompletion = async (goalId, currentStatus) => {
        try {
            await toggleGoalCompletion(rootId, goalId, !currentStatus);
            // Context does not return mapped goal for single update easily, relying on tree refresh.
            // But we might want to close sidebar or update viewingGoal?
            // Existing logic updated viewingGoal... we can just let it be for now or fetch specifics?
            // Actually fetchFractalTree happens in background.
        } catch (err) {
            alert('Error updating goal completion: ' + err.message);
        }
    };

    const confirmDeleteFractal = async () => {
        if (!fractalToDelete) return;

        try {
            await deleteGoal(rootId, fractalToDelete.id);
            // Context auto-refreshes
            setFractalToDelete(null);
            setSidebarMode(null);
            setViewingGoal(null);
            setViewingPracticeSession(null);
        } catch (err) {
            alert('Failed to delete: ' + err.message);
        }
    };

    // Target handlers
    const handleAddTarget = () => {
        setEditingTarget(null);
        setShowTargetModal(true);
    };

    const handleEditTarget = (target) => {
        setEditingTarget(target);
        setShowTargetModal(true);
    };

    const handleDeleteTarget = (targetId) => {
        // Update editedTargets state (will be saved when user clicks Save)
        const updatedTargets = editedTargets.filter(t => t.id !== targetId);
        setEditedTargets(updatedTargets);
    };

    const handleSaveTarget = (target) => {
        // Update editedTargets state (will be saved when user clicks Save)
        let updatedTargets;
        if (editingTarget) {
            // Update existing target
            updatedTargets = editedTargets.map(t =>
                t.id === target.id ? target : t
            );
        } else {
            // Add new target
            updatedTargets = [...editedTargets, target];
        }
        setEditedTargets(updatedTargets);
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
                    onAddPracticeSession={() => {
                        setSelectedShortTermGoals([]);
                        setImmediateGoals([{ name: '', description: '' }]);
                        setShowPracticeSessionModal(true);
                    }}
                    onAddChild={handleAddChildClick}
                    sidebarOpen={!!sidebarMode}
                    key={rootId} // Force refresh on root switch
                />
            </div>

            {/* Sidebar */}
            {sidebarMode && (
                <div className="details-window">
                    <div className="window-content">
                        {/* Close Button */}
                        <button
                            className="close-sidebar-btn"
                            onClick={() => { setSidebarMode(null); setViewingGoal(null); setViewingPracticeSession(null); }}
                            style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                background: 'transparent',
                                border: 'none',
                                color: '#999',
                                fontSize: '24px',
                                cursor: 'pointer',
                                zIndex: 20
                            }}
                        >
                            &times;
                        </button>

                        {sidebarMode === 'goal-details' && (
                            <div className="goal-details-pane">
                                {/* Back button removed as we have X, or keep if preferred for drilldown */}
                                {/* Keeping title/content structure */}

                                {isEditing ? (
                                    <div className="edit-form-sidebar">
                                        <input
                                            type="text"
                                            value={editForm.name}
                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                            className="edit-input-title"
                                            placeholder="Goal Name"
                                        />
                                        <div className="form-group">
                                            <label>Description:</label>
                                            <textarea
                                                value={editForm.description}
                                                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                                rows={5}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Deadline:</label>
                                            <input
                                                type="date"
                                                value={editForm.deadline}
                                                onChange={e => setEditForm({ ...editForm, deadline: e.target.value })}
                                                style={{ background: '#333', border: '1px solid #555', color: 'white', padding: '6px 8px', borderRadius: '4px', marginTop: '5px', width: '100%' }}
                                            />
                                        </div>

                                        {/* Targets Section - Edit Mode */}
                                        <div className="form-group">
                                            <label style={{ marginBottom: '8px', display: 'block' }}>Targets:</label>

                                            {/* Targets Container Box */}
                                            <div style={{
                                                background: '#1e1e1e',
                                                border: '1px solid #444',
                                                borderRadius: '6px',
                                                padding: '12px',
                                                minHeight: '100px'
                                            }}>
                                                {editedTargets.length === 0 ? (
                                                    <p style={{
                                                        color: '#888',
                                                        fontSize: '13px',
                                                        fontStyle: 'italic',
                                                        textAlign: 'center',
                                                        margin: '20px 0'
                                                    }}>
                                                        No targets set. Click "+ Add Target" below to define completion criteria.
                                                    </p>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                                                        {editedTargets.map(target => (
                                                            <TargetCard
                                                                key={target.id}
                                                                target={target}
                                                                activityDefinitions={activities}
                                                                onEdit={() => handleEditTarget(target)}
                                                                onDelete={() => handleDeleteTarget(target.id)}
                                                                isCompleted={false}
                                                                isEditMode={true}
                                                            />
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Add Target Button at Bottom */}
                                                <button
                                                    type="button"
                                                    onClick={handleAddTarget}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px',
                                                        background: '#4caf50',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        color: 'white',
                                                        cursor: 'pointer',
                                                        fontSize: '13px',
                                                        fontWeight: 600,
                                                        transition: 'background 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = '#45a049'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = '#4caf50'}
                                                >
                                                    + Add Target
                                                </button>
                                            </div>
                                        </div>

                                        <div className="sidebar-actions">
                                            <button className="action-btn secondary" onClick={handleCancelEdit}>Cancel</button>
                                            <button className="action-btn primary" onClick={handleSaveEdit}>Save</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ marginBottom: '10px' }}>
                                            <span style={{ background: '#444', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8em', color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                {viewingGoal?.attributes?.type || viewingGoal?.type}
                                            </span>
                                        </div>
                                        <h2>{viewingGoal?.name}</h2>

                                        <div style={{ display: 'flex', gap: '20px', marginBottom: '10px', fontSize: '13px', color: '#999' }}>
                                            {viewingGoal?.attributes?.created_at && (
                                                <div>
                                                    <strong style={{ color: '#ccc' }}>Created:</strong> {new Date(viewingGoal.attributes.created_at).toLocaleDateString()}
                                                </div>
                                            )}
                                            <div>
                                                <strong style={{ color: '#ccc' }}>Deadline:</strong> {viewingGoal?.attributes?.deadline ? new Date(viewingGoal.attributes.deadline).toLocaleDateString() : 'None'}
                                            </div>
                                        </div>

                                        <div className="description-section">
                                            <h4>Description</h4>
                                            <p>{viewingGoal?.attributes?.description || viewingGoal?.description || 'No description provided.'}</p>
                                        </div>

                                        {/* Practice Sessions Section (for ShortTermGoals only) */}
                                        {(viewingGoal?.attributes?.type === 'ShortTermGoal' || viewingGoal?.type === 'ShortTermGoal') && (
                                            <div className="description-section">
                                                <h4>Practice Sessions</h4>
                                                {(() => {
                                                    const goalId = viewingGoal?.attributes?.id || viewingGoal?.id;
                                                    const associatedSessions = practiceSessions.filter(session => {
                                                        const parentIds = session.attributes?.parent_ids || [];
                                                        return parentIds.includes(goalId);
                                                    });

                                                    if (associatedSessions.length === 0) {
                                                        return <p style={{ color: '#888', fontSize: '14px' }}>No practice sessions yet</p>;
                                                    }

                                                    return (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                                            {associatedSessions.map(session => (
                                                                <div
                                                                    key={session.id}
                                                                    onClick={() => navigate(`/${rootId}/session/${session.id}`)}
                                                                    style={{
                                                                        background: '#2a2a2a',
                                                                        border: '1px solid #444',
                                                                        borderRadius: '4px',
                                                                        padding: '10px 12px',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s',
                                                                        fontSize: '14px'
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        e.currentTarget.style.background = '#333';
                                                                        e.currentTarget.style.borderColor = '#666';
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        e.currentTarget.style.background = '#2a2a2a';
                                                                        e.currentTarget.style.borderColor = '#444';
                                                                    }}
                                                                >
                                                                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                                                                        {session.name}
                                                                    </div>
                                                                    {session.attributes?.created_at && (
                                                                        <div style={{ fontSize: '12px', color: '#888' }}>
                                                                            {new Date(session.attributes.created_at).toLocaleDateString()}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        {/* Targets Section - View Mode */}
                                        <div className="description-section">
                                            <h4>Targets</h4>

                                            {(() => {
                                                const targets = viewingGoal?.attributes?.targets || [];

                                                if (targets.length === 0) {
                                                    return (
                                                        <p style={{ color: '#888', fontSize: '14px' }}>
                                                            No targets set. Add a target to define completion criteria.
                                                        </p>
                                                    );
                                                }

                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                        {targets.map(target => (
                                                            <TargetCard
                                                                key={target.id}
                                                                target={target}
                                                                activityDefinitions={activities}
                                                                onEdit={() => handleEditTarget(target)}
                                                                onDelete={() => handleDeleteTarget(target.id)}
                                                                isCompleted={viewingGoal?.attributes?.completed || false}
                                                                isEditMode={false}
                                                            />
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        <div className="sidebar-actions" style={{ flexDirection: 'column', gap: '10px' }}>
                                            <button
                                                className="action-btn"
                                                onClick={() => {
                                                    const goalId = viewingGoal?.attributes?.id || viewingGoal?.id;
                                                    const currentStatus = viewingGoal?.attributes?.completed || false;
                                                    handleToggleCompletion(goalId, currentStatus);
                                                }}
                                                style={{
                                                    background: viewingGoal?.attributes?.completed ? '#4caf50' : 'transparent',
                                                    border: viewingGoal?.attributes?.completed ? 'none' : '2px solid #666',
                                                    color: viewingGoal?.attributes?.completed ? 'white' : '#ccc'
                                                }}
                                            >
                                                {viewingGoal?.attributes?.completed ? '✓ Completed' : 'Mark Complete'}
                                            </button>

                                            <button className="action-btn primary" onClick={handleEditClick}>Edit Goal</button>

                                            {(() => {
                                                const type = viewingGoal?.attributes?.type || viewingGoal?.type;
                                                const childType = getChildType(type);
                                                if (childType) {
                                                    return (
                                                        <button className="action-btn secondary" onClick={() => handleAddChildClick(viewingGoal)}>
                                                            + Add {getTypeDisplayName(childType)}
                                                        </button>
                                                    );
                                                }
                                            })()}

                                            <button className="action-btn danger" onClick={() => setFractalToDelete(viewingGoal)}>Delete Goal</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {sidebarMode === 'session-details' && (
                            <div className="session-details-pane">
                                {isEditing ? (
                                    <div className="edit-form-sidebar">
                                        <input
                                            type="text"
                                            value={editForm.name}
                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                            className="edit-input-title"
                                            placeholder="Session Name"
                                        />
                                        <div className="form-group">
                                            <label>Description:</label>
                                            <textarea
                                                value={editForm.description}
                                                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                                rows={5}
                                            />
                                        </div>
                                        <div className="sidebar-actions">
                                            <button className="action-btn secondary" onClick={handleCancelEdit}>Cancel</button>
                                            <button className="action-btn primary" onClick={handleSaveEdit}>Save</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <h2>{viewingPracticeSession?.name}</h2>
                                        <p className="meta-info">
                                            <strong>Created:</strong> {viewingPracticeSession?.attributes?.created_at ? new Date(viewingPracticeSession.attributes.created_at).toLocaleDateString() : 'Unknown'}
                                        </p>

                                        <div className="description-section">
                                            <h4>Description</h4>
                                            <p>{viewingPracticeSession?.attributes?.description || 'No description provided.'}</p>
                                        </div>

                                        {/* Achieved Targets Indicator */}
                                        {(() => {
                                            // Get parent goals for this session
                                            const parentIds = viewingPracticeSession?.attributes?.parent_ids || [];
                                            const parentGoals = parentIds.map(id => {
                                                const findGoal = (node, targetId) => {
                                                    if (!node) return null;
                                                    if (node.id === targetId || node.attributes?.id === targetId) return node;
                                                    if (node.children) {
                                                        for (const child of node.children) {
                                                            const found = findGoal(child, targetId);
                                                            if (found) return found;
                                                        }
                                                    }
                                                    return null;
                                                };
                                                return findGoal(fractalData, id);
                                            }).filter(Boolean);

                                            const achievedTargets = getAchievedTargetsForSession(viewingPracticeSession, parentGoals);
                                            if (achievedTargets.length === 0) return null;

                                            return (
                                                <div style={{
                                                    marginTop: '16px',
                                                    padding: '12px',
                                                    background: '#1a2e1a',
                                                    borderRadius: '6px',
                                                    borderLeft: '3px solid #4caf50'
                                                }}>
                                                    <h4 style={{ fontSize: '14px', color: '#81c784', marginBottom: '8px', fontWeight: 600 }}>
                                                        🎯 Targets Achieved ({achievedTargets.length}):
                                                    </h4>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                        {achievedTargets.map((achieved, idx) => (
                                                            <div
                                                                key={idx}
                                                                style={{
                                                                    padding: '6px 12px',
                                                                    background: '#2e7d32',
                                                                    borderRadius: '4px',
                                                                    fontSize: '12px',
                                                                    color: 'white',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px'
                                                                }}
                                                            >
                                                                <span>✓</span>
                                                                <span>{achieved.target.name || 'Target'}</span>
                                                                <span style={{ fontSize: '10px', opacity: 0.8 }}>({achieved.goalName})</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        <div className="sidebar-actions">
                                            <button className="action-btn secondary" onClick={handleEditClick}>Edit Session</button>
                                            <button className="action-btn danger" onClick={() => setFractalToDelete(viewingPracticeSession)}>Delete Session</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                    </div>
                </div>
            )}

            {/* Create Goal Modal */}
            {
                showModal && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <h2>{selectedParent ? `Add ${getTypeDisplayName(goalType)} under "${selectedParent.name}"` : "Create New Goal"}</h2>
                            <form onSubmit={handleSubmit}>
                                <label>Type:</label>
                                <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '4px', color: '#333', fontWeight: 'bold' }}>
                                    {getTypeDisplayName(goalType)}
                                </div>

                                <label>Name:</label>
                                <input value={name} onChange={e => setName(e.target.value)} required />

                                <label>Description:</label>
                                <textarea value={description} onChange={e => setDescription(e.target.value)} />

                                <label>Deadline:</label>
                                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />

                                <div className="actions">
                                    <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit">Create</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Delete Confirmation Modal */}
            {
                fractalToDelete && (
                    <div className="modal-overlay" onClick={() => setFractalToDelete(null)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <h2>Delete {fractalToDelete.attributes?.type === 'PracticeSession' ? 'Session' : 'Goal'}?</h2>
                            <p>Are you sure you want to delete <strong>"{fractalToDelete.name}"</strong>?</p>
                            <p style={{ color: '#ff5252', fontSize: '0.9rem' }}>This action cannot be undone.</p>
                            <div className="actions">
                                <button type="button" onClick={() => setFractalToDelete(null)}>Cancel</button>
                                <button
                                    type="button"
                                    onClick={confirmDeleteFractal}
                                    style={{ background: '#d32f2f', color: 'white', border: 'none' }}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Practice Session Modal */}
            {
                showPracticeSessionModal && (
                    <div className="modal-overlay" onClick={() => setShowPracticeSessionModal(false)}>
                        <div className="modal practice-session-modal" onClick={(e) => e.stopPropagation()}>
                            <h2>Create Practice Session</h2>

                            <div className="modal-content-scroll">
                                <div className="session-name-preview">
                                    <strong>Session Name:</strong>
                                    <p>Practice Session # - {new Date().toLocaleDateString()}</p>
                                    <p style={{ fontSize: '0.8em', color: '#888', fontStyle: 'italic', marginTop: '5px' }}>
                                        (Name will be automatically generated)
                                    </p>
                                </div>

                                <div className="form-section">
                                    <label><strong>Select Short-Term Goals (Required):</strong></label>
                                    <div className="checkbox-list">
                                        {(() => {
                                            const shortTermGoals = collectShortTermGoals(fractalData);
                                            if (shortTermGoals.length === 0) {
                                                return <p className="no-goals-message">No short-term goals available.</p>;
                                            }
                                            return shortTermGoals.map(goal => (
                                                <label key={goal.id} className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedShortTermGoals.includes(goal.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedShortTermGoals([...selectedShortTermGoals, goal.id]);
                                                            } else {
                                                                setSelectedShortTermGoals(selectedShortTermGoals.filter(id => id !== goal.id));
                                                            }
                                                        }}
                                                    />
                                                    <span>{goal.name}</span>
                                                </label>
                                            ));
                                        })()}
                                    </div>
                                </div>

                                <div className="form-section">
                                    <label><strong>Immediate Goals:</strong></label>
                                    {immediateGoals.map((goal, index) => (
                                        <div key={index} className="immediate-goal-item">
                                            <input
                                                type="text"
                                                placeholder="Goal name"
                                                value={goal.name}
                                                onChange={(e) => {
                                                    const updated = [...immediateGoals];
                                                    updated[index].name = e.target.value;
                                                    setImmediateGoals(updated);
                                                }}
                                                className="immediate-goal-input"
                                            />
                                            <textarea
                                                placeholder="Description (optional)"
                                                value={goal.description}
                                                onChange={(e) => {
                                                    const updated = [...immediateGoals];
                                                    updated[index].description = e.target.value;
                                                    setImmediateGoals(updated);
                                                }}
                                                className="immediate-goal-textarea"
                                                rows="2"
                                            />
                                            {immediateGoals.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setImmediateGoals(immediateGoals.filter((_, i) => i !== index))}
                                                    className="remove-goal-btn"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setImmediateGoals([...immediateGoals, { name: '', description: '' }])}
                                        className="add-goal-btn"
                                    >
                                        + Add Another Immediate Goal
                                    </button>
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="action-btn primary"
                                    onClick={async () => {
                                        if (selectedShortTermGoals.length === 0) {
                                            alert('Please select at least one short-term goal');
                                            return;
                                        }

                                        const validImmediateGoals = immediateGoals.filter(g => g.name.trim() !== '');
                                        if (validImmediateGoals.length === 0) {
                                            alert('Please add at least one immediate goal');
                                            return;
                                        }

                                        try {
                                            const payload = {
                                                name: "Auto-Generated",
                                                description: `Practice session with ${validImmediateGoals.length} immediate goal(s)`,
                                                parent_ids: selectedShortTermGoals,
                                                immediate_goals: validImmediateGoals
                                            };

                                            await createSession(rootId, payload);
                                            setShowPracticeSessionModal(false);
                                        } catch (err) {
                                            alert('Error creating practice session: ' + err.message);
                                        }
                                    }}
                                >
                                    Create Practice Session
                                </button>
                                <button type="button" onClick={() => setShowPracticeSessionModal(false)}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Add/Edit Target Modal */}
            <AddTargetModal
                isOpen={showTargetModal}
                onClose={() => {
                    setShowTargetModal(false);
                    setEditingTarget(null);
                }}
                onSave={handleSaveTarget}
                activityDefinitions={activities}
                existingTarget={editingTarget}
            />
        </div >
    );
}

export default FractalGoals;
