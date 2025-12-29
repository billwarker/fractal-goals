import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTypeDisplayName, getChildType, calculateGoalAge } from '../utils/goalHelpers';
import { getGoalColor, getGoalTextColor } from '../utils/goalColors';
import { getAchievedTargetsForSession } from '../utils/targetUtils';
import TargetCard from './TargetCard';
import AddTargetModal from './AddTargetModal';
import './Sidebar.css';

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

        const isPracticeSession = selectedNode?.attributes?.type === 'PracticeSession' ||
            selectedNode?.type === 'PracticeSession' ||
            selectedNode?.__isPracticeSession;

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
                    <div className="inspector-empty-state">
                        <h2 className="inspector-title">Inspector</h2>
                        <p>Select a Goal or Practice Session in the graph to view details.</p>
                        {selectedRootId ? (
                            <button
                                className="practice-session-btn w-100 mt-20"
                                onClick={onAddSession}
                            >
                                + Add Practice Session
                            </button>
                        ) : (
                            <p className="select-hint">Select a Fractal Tree from the main view first.</p>
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
                                        className="edit-input-deadline"
                                    />
                                </div>
                            )}

                            {/* Targets Editor (Goals Only) */}
                            {!isPracticeSession && (
                                <div className="form-group">
                                    <label className="mb-8 block-display">Targets:</label>
                                    <div className="targets-editor-container">
                                        {editedTargets.length === 0 ? (
                                            <p className="no-targets-text">
                                                No targets set. Click "+ Add Target" below.
                                            </p>
                                        ) : (
                                            <div className="targets-list">
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
                                            className="add-target-btn"
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
                                <div className="header-meta">
                                    <span
                                        className="type-badge"
                                        style={{
                                            background: getGoalColor(selectedNode.attributes?.type || selectedNode.type),
                                            color: getGoalTextColor(selectedNode.attributes?.type || selectedNode.type)
                                        }}
                                    >
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
                                                        className="session-item"
                                                    >
                                                        <div className="session-item-title">
                                                            {session.name}
                                                        </div>
                                                        {session.attributes?.created_at && (
                                                            <div className="session-item-date">
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
                                    <div className="achieved-targets-box">
                                        <h4 className="achieved-targets-title">
                                            🎯 Targets Achieved ({achievedTargets.length}):
                                        </h4>
                                        <div className="achieved-targets-list">
                                            {achievedTargets.map((achieved, idx) => (
                                                <div key={idx} className="achieved-target-pill">
                                                    <span>✓</span>
                                                    <span>{achieved.target.name || 'Target'}</span>
                                                    <span className="target-pill-subtext">({achieved.goalName})</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="sidebar-actions mt-20">
                                {!isPracticeSession && (
                                    <button
                                        className={`action-btn ${selectedNode.attributes?.completed ? 'completion-btn-active' : 'completion-btn-inactive'}`}
                                        onClick={() => onToggleCompletion(selectedNode.attributes?.id || selectedNode.id, selectedNode.attributes?.completed)}
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
