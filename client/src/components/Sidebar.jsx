import React, { useState, useEffect } from 'react';
import { getTypeDisplayName, getChildType, calculateGoalAge } from '../utils/goalHelpers';

const Sidebar = ({
    selectedNode,
    selectedRootId,
    onClose,
    onUpdate,
    onDelete,
    onAddChild,
    onAddSession,
    onToggleCompletion
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', description: '', deadline: '' });

    // Reset editing state when selection changes
    useEffect(() => {
        setIsEditing(false);
    }, [selectedNode]);

    // Initialize form when entering edit mode
    useEffect(() => {
        if (isEditing && selectedNode) {
            setEditForm({
                name: selectedNode.name || '',
                description: selectedNode.attributes?.description || selectedNode.description || '',
                deadline: selectedNode.attributes?.deadline || selectedNode.deadline || ''
            });
        }
    }, [isEditing, selectedNode]);

    const handleSave = () => {
        onUpdate({
            ...editForm,
            deadline: editForm.deadline === '' ? null : editForm.deadline
        });
        setIsEditing(false);
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
                    <button className="back-btn" onClick={onClose}>← Close</button>

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
                                        style={{ background: '#333', border: '1px solid #555', color: 'white', padding: '8px', borderRadius: '4px', marginTop: '5px' }}
                                    />
                                </div>
                            )}
                            <div className="sidebar-actions">
                                <button className="action-btn secondary" onClick={() => setIsEditing(false)}>Cancel</button>
                                <button className="action-btn primary" onClick={handleSave}>Save</button>
                            </div>
                        </div>
                    ) : (
                        <>
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

                            <div className="description-section">
                                <h4>Description</h4>
                                <p>{selectedNode.attributes?.description || selectedNode.description || 'No description provided.'}</p>
                            </div>

                            {!isPracticeSession && (selectedNode.attributes?.deadline || selectedNode.deadline) && (
                                <div className="description-section" style={{ maxHeight: '100px' }}>
                                    <h4>Deadline</h4>
                                    <p>{selectedNode.attributes?.deadline || selectedNode.deadline}</p>
                                </div>
                            )}

                            {!isPracticeSession && (
                                <>
                                    <h4>Immediate Children:</h4>
                                    {selectedNode.children && selectedNode.children.length > 0 ? (
                                        <ul className="children-list">
                                            {selectedNode.children.map(child => (
                                                <li key={child.attributes?.id || child.id}>
                                                    <strong>{child.name}</strong> ({getTypeDisplayName(child.attributes?.type || child.type)})
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="no-children">No children yet.</p>
                                    )}

                                    <div className="completion-section">
                                        <label className="completion-label">
                                            <input
                                                type="checkbox"
                                                checked={selectedNode.attributes?.completed || false}
                                                onChange={() => onToggleCompletion(selectedNode)}
                                            />
                                            <span>
                                                Mark as {selectedNode.attributes?.completed ? 'Incomplete' : 'Completed'}
                                            </span>
                                        </label>
                                    </div>
                                </>
                            )}

                            <div className="sidebar-actions" style={{ flexDirection: 'column', gap: '10px' }}>
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
        </div>
    );
};

export default Sidebar;
