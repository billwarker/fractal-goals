import React from 'react';

const DeleteConfirmModal = ({ item, isFractal, onConfirm, onCancel }) => {
    if (!item) return null;

    return (
        <div className="modal-overlay">
            <div className="modal">
                <h2>Delete {isFractal ? "Fractal" : "Goal"}?</h2>
                <p>Are you sure you want to delete <strong>"{item.name}"</strong>?</p>
                <p style={{ color: '#ff5252', fontSize: '0.9rem' }}>This action cannot be undone.</p>
                <div className="actions">
                    <button type="button" onClick={onCancel}>Cancel</button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        style={{ background: '#d32f2f', color: 'white', border: 'none' }}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteConfirmModal;
