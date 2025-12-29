import React from 'react';

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, title, message }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2>{title || "Confirm Delete"}</h2>
                <div style={{ margin: '15px 0' }}>
                    {message ? <p>{message}</p> : <p>Are you sure you want to delete this item?</p>}
                    <p style={{ color: '#ff5252', fontSize: '0.9rem', marginTop: '10px' }}>This action cannot be undone.</p>
                </div>
                <div className="actions">
                    <button type="button" onClick={onClose} className="action-btn secondary">Cancel</button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="action-btn danger"
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
