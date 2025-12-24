import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import FlowTree from '../FlowTree';
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

const calculateMetrics = (goalNode, allPracticeSessions = []) => {
    if (!goalNode) return { totalGoals: 0, completedGoals: 0, completionPercentage: 0, practiceSessionCount: 0 };

    let totalGoals = 0;
    let completedGoals = 0;
    const goalIds = new Set();

    const traverse = (node) => {
        totalGoals++;
        goalIds.add(node.id || node.attributes?.id);
        if (node.attributes?.completed) {
            completedGoals++;
        }
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => traverse(child));
        }
    };

    traverse(goalNode);

    let practiceSessionCount = 0;
    if (allPracticeSessions.length > 0) {
        practiceSessionCount = allPracticeSessions.filter(session => {
            const parentIds = session.attributes?.parent_ids || [];
            return parentIds.some(pid => goalIds.has(pid));
        }).length;
    }

    const completionPercentage = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;
    return { totalGoals, completedGoals, completionPercentage, practiceSessionCount };
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
    const { rootId } = useParams(); // Get rootId from URL!
    const navigate = useNavigate();

    const [practiceSessions, setPracticeSessions] = useState([]);
    const [selectedPracticeSession, setSelectedPracticeSession] = useState(null);
    const [fractalData, setFractalData] = useState(null);
    const [loading, setLoading] = useState(true);

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

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchFractalData();
        fetchPracticeSessions();
    }, [rootId, navigate]);

    const fetchFractalData = async () => {
        try {
            const res = await fractalApi.getGoals(rootId);
            setFractalData(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch fractal data", err);
            setLoading(false);
            // If fractal not found, redirect to home
            if (err.response?.status === 404) {
                navigate('/');
            }
        }
    };

    const fetchPracticeSessions = async () => {
        try {
            const res = await fractalApi.getSessions(rootId);
            setPracticeSessions(res.data);
        } catch (err) {
            console.error("Failed to fetch practice sessions", err);
        }
    };

    const fetchGoals = async () => {
        // Refresh fractal data
        await fetchFractalData();
        await fetchPracticeSessions();
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
        setSelectedParent(nodeDatum);
        const parentType = nodeDatum.attributes?.type || nodeDatum.type;
        const childType = getChildType(parentType);
        if (!childType) {
            alert('This goal type cannot have children.');
            return;
        }
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
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
    };

    const handleSaveEdit = async () => {
        try {
            const target = sidebarMode === 'session-details' ? viewingPracticeSession : viewingGoal;
            const goalId = target.id || target.attributes?.id;

            const payload = { ...editForm };
            if (payload.deadline === '') payload.deadline = null;

            await fractalApi.updateGoal(rootId, String(goalId), payload);
            await fetchGoals();
            await fetchPracticeSessions();

            if (sidebarMode === 'session-details') {
                const updatedSession = {
                    ...viewingPracticeSession,
                    name: payload.name,
                    attributes: {
                        ...viewingPracticeSession.attributes,
                        description: payload.description
                    }
                };
                setViewingPracticeSession(updatedSession);
            } else if (sidebarMode === 'goal-details') {
                const updatedGoal = {
                    ...viewingGoal,
                    name: payload.name,
                    attributes: {
                        ...viewingGoal.attributes,
                        description: payload.description,
                        deadline: payload.deadline
                    }
                };
                setViewingGoal(updatedGoal);
            }

            setIsEditing(false);
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

            await fractalApi.createGoal(rootId, payload);
            setShowModal(false);
            setName('');
            setDescription('');
            setDeadline('');
            await fetchGoals();
        } catch (err) {
            alert('Error creating goal: ' + err.message);
        }
    };

    const handleToggleCompletion = async (goalId, currentStatus) => {
        try {
            const response = await fractalApi.toggleGoalCompletion(rootId, goalId, !currentStatus);

            if (viewingGoal && (viewingGoal.attributes?.id === goalId || viewingGoal.id === goalId)) {
                setViewingGoal(response.data.goal);
            }

            await fetchGoals();
        } catch (err) {
            alert('Error updating goal completion: ' + err.message);
        }
    };

    const confirmDeleteFractal = async () => {
        if (!fractalToDelete) return;

        try {
            await fractalApi.deleteGoal(rootId, fractalToDelete.id);
            await fetchGoals();
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

    const metrics = calculateMetrics(fractalData, practiceSessions);

    return (
        <div className="fractal-goals-page" style={{ display: 'flex', height: '100%', position: 'relative' }}>
            {/* Main Content - FlowTree */}
            <div style={{ flex: 1, position: 'relative' }}>
                {/* Metrics Overlay */}
                <div className="metrics-overlay">
                    <div className="metric-item">{metrics.totalGoals} goals</div>
                    <div className="metric-item">{metrics.practiceSessionCount} sessions</div>
                    <div className="metric-item">{metrics.completionPercentage}% complete</div>
                </div>

                <FlowTree
                    treeData={fractalData}
                    onNodeClick={handleGoalNameClick}
                    selectedPracticeSession={selectedPracticeSession}
                    onAddPracticeSession={() => {
                        setSelectedShortTermGoals([]);
                        setImmediateGoals([{ name: '', description: '' }]);
                        setShowPracticeSessionModal(true);
                    }}
                    onAddChild={handleAddChildClick}
                    key={rootId + (selectedPracticeSession?.id || '')}
                    sidebarOpen={!!sidebarMode}
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
                                                style={{ background: '#333', border: '1px solid #555', color: 'white', padding: '8px', borderRadius: '4px', marginTop: '5px' }}
                                            />
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

                                        {viewingGoal?.attributes?.created_at && (
                                            <p className="meta-info">Created: {new Date(viewingGoal.attributes.created_at).toLocaleDateString()}</p>
                                        )}

                                        <div className="description-section">
                                            <h4>Description</h4>
                                            <p>{viewingGoal?.attributes?.description || viewingGoal?.description || 'No description provided.'}</p>
                                        </div>

                                        <div className="description-section" style={{ maxHeight: '100px' }}>
                                            <h4>Deadline</h4>
                                            <p>{viewingGoal?.attributes?.deadline || viewingGoal?.deadline || 'No deadline set'}</p>
                                        </div>

                                        <div className="sidebar-actions" style={{ flexDirection: 'column', gap: '10px' }}>
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

                                            await fractalApi.createSession(rootId, payload);
                                            setShowPracticeSessionModal(false);
                                            await fetchGoals();
                                            await fetchPracticeSessions();
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
        </div >
    );
}

export default FractalGoals;
