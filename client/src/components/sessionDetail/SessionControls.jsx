import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../../pages/SessionDetail.css';

const SessionControls = ({
    isCompleted,
    onDelete,
    onCancel,
    onToggleComplete,
    onSave,
}) => {
    return (
        <div className="session-controls-bar">
            {/* Delete Button */}
            <button
                type="button"
                onClick={onDelete}
                className="session-control-btn btn-delete"
            >
                Delete Session
            </button>

            {/* Cancel Button */}
            <button
                onClick={onCancel}
                className="session-control-btn btn-cancel"
            >
                Cancel
            </button>

            {/* Mark Complete Button */}
            <button
                onClick={onToggleComplete}
                className={`session-control-btn btn-complete ${isCompleted ? 'completed' : ''}`}
            >
                {isCompleted ? '✓ Completed' : 'Mark Complete'}
            </button>

            {/* Done Button */}
            <button
                onClick={onSave}
                className="session-control-btn btn-done"
            >
                Done
            </button>
        </div>
    );
};

export default SessionControls;
