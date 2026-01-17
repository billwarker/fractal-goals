import React from 'react';
import GoalDetailModal from './GoalDetailModal';
import './Sidebar.css';

/**
 * Sidebar Component
 * 
 * Displays details for the selected goal in the fractal tree.
 * Uses GoalDetailModal in panel mode for a standardized editing experience.
 * 
 * NOTE: Sessions are NO LONGER displayed in the goal tree sidebar.
 * They are managed separately via the /sessions page.
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
    sessions = [],
    activityDefinitions = [],
    activityGroups = [],
    programs = []
}) => {

    // Handler for GoalDetailModal - bridges to the Sidebar's onUpdate prop
    const handleGoalUpdate = (goalId, updates) => {
        onUpdate(updates);
    };

    // Default View (No Node Selected)
    if (!selectedNode) {
        return (
            <div className="details-window">
                <div className="window-content">
                    <div className="inspector-empty-state">
                        <h2 className="inspector-title">Inspector</h2>
                        <p>Select a Goal in the graph to view details.</p>
                        {selectedRootId ? (
                            <button
                                className="session-btn w-100 mt-20"
                                onClick={onAddSession}
                            >
                                + Create New Session
                            </button>
                        ) : (
                            <p className="select-hint">Select a Fractal Tree from the main view first.</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Goal View - Use GoalDetailModal in Panel Mode
    return (
        <div className="details-window">
            <div className="window-content" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <GoalDetailModal
                    isOpen={true}
                    onClose={onClose}
                    goal={selectedNode}
                    onUpdate={handleGoalUpdate}
                    activityDefinitions={activityDefinitions}
                    onToggleCompletion={onToggleCompletion}
                    onAddChild={onAddChild}
                    onDelete={onDelete}
                    sessions={sessions}
                    rootId={selectedRootId}
                    treeData={treeData}
                    displayMode="panel"
                    programs={programs}
                    activityGroups={activityGroups}
                />
            </div>
        </div>
    );
};

export default Sidebar;
