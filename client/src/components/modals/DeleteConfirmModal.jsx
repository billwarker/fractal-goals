import React, { useState, useEffect } from 'react';

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, title, message, requireMatchingText }) => {
    const [confirmText, setConfirmText] = useState('');

    useEffect(() => {
        if (isOpen) {
            setConfirmText('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isConfirmDisabled = requireMatchingText && confirmText !== requireMatchingText;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2>{title || "Confirm Delete"}</h2>
                <div style={{ margin: '15px 0' }}>
                    {message ? <p>{message}</p> : <p>Are you sure you want to delete this item?</p>}

                    {requireMatchingText && (
                        <div style={{ marginTop: '15px' }}>
                            <p style={{ fontSize: '0.9rem', marginBottom: '8px', color: '#ccc' }}>
                                Type <strong>{requireMatchingText}</strong> below to confirm.
                            </p>
                            <input
                                type="text"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder={`Type "${requireMatchingText}"`}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    border: '1px solid #444',
                                    background: '#222',
                                    color: 'white',
                                    fontSize: '14px',
                                    outline: 'none'
                                }}
                                autoFocus
                            />
                        </div>
                    )}

                    <p style={{ color: '#ff5252', fontSize: '0.9rem', marginTop: '10px' }}>This action cannot be undone.</p>
                </div>
                <div className="actions">
                    <button type="button" onClick={onClose} className="action-btn secondary">Cancel</button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isConfirmDisabled}
                        className="action-btn danger"
                        style={{
                            background: isConfirmDisabled ? '#555' : '#d32f2f',
                            color: isConfirmDisabled ? '#aaa' : 'white',
                            border: 'none',
                            cursor: isConfirmDisabled ? 'not-allowed' : 'pointer',
                            opacity: isConfirmDisabled ? 0.7 : 1
                        }}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteConfirmModal;
