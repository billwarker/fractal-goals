import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAchievedTargetsForSession } from '../utils/targetUtils';
import GoalDetailModal from './GoalDetailModal';
import './Sidebar.css';

/**
 * Sidebar Component
 * 
 * Displays details for the selected node in the fractal tree.
 * - For Goals: Uses GoalDetailModal in panel mode (standardized component)
 * - For Practice Sessions: Shows inline view/edit (session-specific UI)
 */
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

    // State for Practice Session editing (inline)
    const [isEditingSession, setIsEditingSession] = useState(false);
    const [sessionForm, setSessionForm] = useState({ name: '', description: '' });

    // Reset editing state when selection changes 
    useEffect(() => {
        setIsEditingSession(false);
    }, [selectedNode]);

    // Initialize session form when entering edit mode
    useEffect(() => {
        if (isEditingSession && selectedNode) {
            setSessionForm({
                name: selectedNode.name || '',
                description: selectedNode.attributes?.description || selectedNode.description || ''
            });
        }
    }, [isEditingSession, selectedNode]);

    const handleSessionSave = () => {
        onUpdate(sessionForm);
        setIsEditingSession(false);
    };

    // Handler for GoalDetailModal - bridges to the Sidebar's onUpdate prop
    const handleGoalUpdate = (goalId, updates) => {
        onUpdate(updates);
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

    // ============ GOAL VIEW - Use GoalDetailModal in Panel Mode ============
    if (!isPracticeSession) {
        return (
            <div className="details-window">
                <div className="window-content" style={{ padding: 0 }}>
                    <GoalDetailModal
                        isOpen={true}
                        onClose={onClose}
                        goal={selectedNode}
                        onUpdate={handleGoalUpdate}
                        activityDefinitions={activityDefinitions}
                        onToggleCompletion={onToggleCompletion}
                        onAddChild={onAddChild}
                        onDelete={onDelete}
                        practiceSessions={practiceSessions}
                        rootId={selectedRootId}
                        treeData={treeData}
                        displayMode="panel"
                    />
                </div>
            </div>
        );
    }

    // ============ PRACTICE SESSION VIEW - Inline ============
    return (
        <div className="details-window">
            <div className="window-content">
                <div className="session-details-pane">
                    {/* Close Button */}
                    <button className="close-sidebar-btn" onClick={onClose}>
                        &times;
                    </button>

                    {isEditingSession ? (
                        /* Session Edit Mode */
                        <div className="edit-form-sidebar">
                            <input
                                type="text"
                                value={sessionForm.name}
                                onChange={e => setSessionForm({ ...sessionForm, name: e.target.value })}
                                className="edit-input-title"
                                placeholder="Session Name"
                            />
                            <div className="form-group">
                                <label>Description:</label>
                                <textarea
                                    value={sessionForm.description}
                                    onChange={e => setSessionForm({ ...sessionForm, description: e.target.value })}
                                    rows={5}
                                />
                            </div>

                            <div className="sidebar-actions">
                                <button className="action-btn secondary" onClick={() => setIsEditingSession(false)}>Cancel</button>
                                <button className="action-btn primary" onClick={handleSessionSave}>Save</button>
                            </div>
                        </div>
                    ) : (
                        /* Session View Mode */
                        <>
                            <h2>{selectedNode.name}</h2>

                            {selectedNode.attributes?.created_at && (
                                <p className="meta-info">
                                    Created: {new Date(selectedNode.attributes.created_at).toLocaleDateString()}
                                </p>
                            )}

                            <div className="description-section">
                                <h4>Description</h4>
                                <p>{selectedNode.attributes?.description || selectedNode.description || 'No description provided.'}</p>
                            </div>

                            {/* Achieved Targets */}
                            {treeData && (() => {
                                const parentIds = selectedNode.attributes?.parent_ids || [];
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
                                <button
                                    className="action-btn primary"
                                    onClick={() => navigate(`/${selectedRootId}/session/${selectedNode.id}`)}
                                >
                                    Open Session
                                </button>

                                <button className="action-btn secondary" onClick={() => setIsEditingSession(true)}>
                                    Edit Session
                                </button>

                                <button className="action-btn danger" onClick={() => onDelete(selectedNode)}>
                                    Delete Session
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
