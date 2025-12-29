import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTypeDisplayName, getChildType, calculateGoalAge } from '../utils/goalHelpers';
import { getAchievedTargetsForSession } from '../utils/targetUtils';
import TargetCard from './TargetCard';
import AddTargetModal from './AddTargetModal';

const Sidebar = ({
    selectedNode,
    selectedRootId,
    onClose,
    onUpdate,
    onDelete,
    onAddChild,
    onAddSession,
    onToggleCompletion,
    // Data props needed for enhanced features
    treeData,
    practiceSessions = [],
    activityDefinitions = []
}) => {
    const navigate = useNavigate();
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', description: '', deadline: '' });

    // Target Management State
    const [editedTargets, setEditedTargets] = useState([]);
    const [showTargetModal, setShowTargetModal] = useState(false);
    const [editingTarget, setEditingTarget] = useState(null);

    // Reset editing state when selection changes
    useEffect(() => {
        setIsEditing(false);
        setEditedTargets([]);
        setEditingTarget(null);
    }, [selectedNode]);

    // Initialize form when entering edit mode
    useEffect(() => {
        if (isEditing && selectedNode) {
            setEditForm({
                name: selectedNode.name || '',
                description: selectedNode.attributes?.description || selectedNode.description || '',
                deadline: selectedNode.attributes?.deadline || selectedNode.deadline || ''
            });
            // Initialize targets
            setEditedTargets(selectedNode.attributes?.targets || []);
        }
    }, [isEditing, selectedNode]);

    const handleSave = () => {
        // Prepare payload
        const payload = {
            ...editForm,
            deadline: editForm.deadline === '' ? null : editForm.deadline,
        };

        // Include targets if it's a Goal
        if (!isPracticeSession) {
            payload.targets = editedTargets;
        }

        onUpdate(payload);
        setIsEditing(false);
    };

    // Target Handlers (Local State)
    const handleAddTarget = () => {
        setEditingTarget(null);
        setShowTargetModal(true);
    };

    const handleEditTarget = (target) => {
        setEditingTarget(target);
        setShowTargetModal(true);
    };

    const handleDeleteTarget = (targetId) => {
        setEditedTargets(prev => prev.filter(t => t.id !== targetId));
    };

    const handleSaveTarget = (target) => {
        if (editingTarget) {
            // Update existing
            setEditedTargets(prev => prev.map(t => t.id === target.id ? target : t));
        } else {
            // Add new
            setEditedTargets(prev => [...prev, target]);
        }
    };

    const isPracticeSession = selectedNode?.attributes?.type === 'PracticeSession' ||
        selectedNode?.type === 'PracticeSession' ||
        selectedNode?.__isPracticeSession;

    // Default View (No Node Selected)
    if (!selectedNode) {
        return (
            <div className="details-window">
                <div className="window-content">
                    <div style={{ padding: '40px', textAlign: 'center', color: '#666', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80%' }}>
                        <h2 style={{ fontWeight: 300, marginBottom: '10px' }}>Inspector</h2>
                        <p>Select a Goal or Practice Session in the graph to view details.</p>
                        {selectedRootId ? (
                            <button
                                className="practice-session-btn"
                                style={{ marginTop: '30px', padding: '12px 20px', background: 'var(--accent-color)', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 600, width: '100%' }}
                                onClick={onAddSession}
                            >
                                + Add Practice Session
                            </button>
                        ) : (
                            <p style={{ color: '#888', fontStyle: 'italic', marginTop: '20px' }}>Select a Fractal Tree from the main view first.</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Details View
    return (
        <div className="details-window">
            <div className="window-content">
                <div className={isPracticeSession ? "session-details-pane" : "goal-details-pane"}>

                    {/* Header / Close Button */}
                    <button
                        className="close-sidebar-btn"
                        onClick={onClose}
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

                    {isEditing ? (
                        <div className="edit-form-sidebar">
                            <input
                                type="text"
                                value={editForm.name}
                                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                className="edit-input-title"
                                placeholder={isPracticeSession ? "Session Name" : "Goal Name"}
                            />
                            <div className="form-group">
                                <label>Description:</label>
                                <textarea
                                    value={editForm.description}
                                    onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                    rows={5}
                                />
                            </div>
                            {!isPracticeSession && (
                                <div className="form-group">
                                    <label>Deadline:</label>
                                    <input
                                        type="date"
                                        value={editForm.deadline}
                                        onChange={e => setEditForm({ ...editForm, deadline: e.target.value })}
                                        style={{ background: '#333', border: '1px solid #555', color: 'white', padding: '8px', borderRadius: '4px', marginTop: '5px', width: '100%' }}
                                    />
                                </div>
                            )}

                            {/* Targets Editor (Goals Only) */}
                            {!isPracticeSession && (
                                <div className="form-group">
                                    <label style={{ marginBottom: '8px', display: 'block' }}>Targets:</label>
                                    <div style={{
                                        background: '#1e1e1e',
                                        border: '1px solid #444',
                                        borderRadius: '6px',
                                        padding: '12px',
                                        minHeight: '100px'
                                    }}>
                                        {editedTargets.length === 0 ? (
                                            <p style={{ color: '#888', fontSize: '13px', fontStyle: 'italic', textAlign: 'center', margin: '20px 0' }}>
                                                No targets set. Click "+ Add Target" below.
                                            </p>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                                                {editedTargets.map(target => (
                                                    <TargetCard
                                                        key={target.id}
                                                        target={target}
                                                        activityDefinitions={activityDefinitions}
                                                        onEdit={() => handleEditTarget(target)}
                                                        onDelete={() => handleDeleteTarget(target.id)}
                                                        isCompleted={false}
                                                        isEditMode={true}
                                                    />
                                                ))}
                                            </div>
                                        )}
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
                            )}

                            <div className="sidebar-actions">
                                <button className="action-btn secondary" onClick={() => setIsEditing(false)}>Cancel</button>
                                <button className="action-btn primary" onClick={handleSave}>Save</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* View Mode */}
                            {!isPracticeSession && (
                                <div style={{ marginBottom: '10px' }}>
                                    <span style={{ background: '#444', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8em', color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        {selectedNode.attributes?.type || selectedNode.type}
                                    </span>
                                </div>
                            )}
                            <h2>{selectedNode.name}</h2>

                            {selectedNode.attributes?.created_at && (
                                <p className="meta-info">
                                    Created: {new Date(selectedNode.attributes.created_at).toLocaleDateString()}
                                    {!isPracticeSession && ` (${calculateGoalAge(selectedNode.attributes.created_at)})`}
                                </p>
                            )}

                            {!isPracticeSession && (selectedNode.attributes?.deadline || selectedNode.deadline) && (
                                <p className="meta-info">
                                    <strong>Deadline:</strong> {selectedNode.attributes?.deadline || selectedNode.deadline}
                                </p>
                            )}

                            <div className="description-section">
                                <h4>Description</h4>
                                <p>{selectedNode.attributes?.description || selectedNode.description || 'No description provided.'}</p>
                            </div>

                            {/* Practice Sessions Check (ShortTermGoal) */}
                            {!isPracticeSession && (selectedNode.attributes?.type === 'ShortTermGoal' || selectedNode.type === 'ShortTermGoal') && (
                                <div className="description-section">
                                    <h4>Practice Sessions</h4>
                                    {(() => {
                                        const goalId = selectedNode.attributes?.id || selectedNode.id;
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
                                                        onClick={() => navigate(`/${selectedRootId}/session/${session.id}`)}
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

                            {/* Targets Section (Goal View) */}
                            {!isPracticeSession && (
                                <div className="description-section">
                                    <h4>Targets</h4>
                                    {(() => {
                                        const targets = selectedNode.attributes?.targets || [];
                                        if (targets.length === 0) {
                                            return <p style={{ color: '#888', fontSize: '14px' }}>No targets set.</p>;
                                        }
                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {targets.map(target => (
                                                    <TargetCard
                                                        key={target.id}
                                                        target={target}
                                                        activityDefinitions={activityDefinitions}
                                                        // No actions in view mode
                                                        isCompleted={selectedNode.attributes?.completed || false}
                                                        isEditMode={false}
                                                    />
                                                ))}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Achieved Targets (Practice Session View) */}
                            {isPracticeSession && treeData && (() => {
                                const parentIds = selectedNode.attributes?.parent_ids || [];
                                // Helper to find goals in tree
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
                                const parentGoals = parentIds.map(id => findGoal(treeData, id)).filter(Boolean);
                                const achievedTargets = getAchievedTargetsForSession(selectedNode, parentGoals);

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

                            <div className="sidebar-actions" style={{ flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
                                {!isPracticeSession && (
                                    <button
                                        className="action-btn"
                                        onClick={() => onToggleCompletion(selectedNode.attributes?.id || selectedNode.id, selectedNode.attributes?.completed)}
                                        style={{
                                            background: selectedNode.attributes?.completed ? '#4caf50' : 'transparent',
                                            border: selectedNode.attributes?.completed ? 'none' : '2px solid #666',
                                            color: selectedNode.attributes?.completed ? 'white' : '#ccc'
                                        }}
                                    >
                                        {selectedNode.attributes?.completed ? '✓ Completed' : 'Mark Complete'}
                                    </button>
                                )}

                                <button className="action-btn primary" onClick={() => setIsEditing(true)}>
                                    Edit {isPracticeSession ? "Session" : "Goal"}
                                </button>

                                {!isPracticeSession && (() => {
                                    const type = selectedNode.attributes?.type || selectedNode.type;
                                    const childType = getChildType(type);
                                    if (childType) {
                                        return (
                                            <button className="action-btn secondary" onClick={() => onAddChild(selectedNode)}>
                                                + Add {childType}
                                            </button>
                                        );
                                    }
                                })()}

                                <button className="action-btn danger" onClick={() => onDelete(selectedNode)}>
                                    Delete {isPracticeSession ? "Session" : "Goal"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <AddTargetModal
                isOpen={showTargetModal}
                onClose={() => {
                    setShowTargetModal(false);
                    setEditingTarget(null);
                }}
                onSave={handleSaveTarget}
                activityDefinitions={activityDefinitions}
                existingTarget={editingTarget}
            />
        </div>
    );
};

export default Sidebar;
