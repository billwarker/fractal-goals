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
    const themeColor = '#ff5252'; // Red for delete

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '450px', maxWidth: '90vw' }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    paddingBottom: '16px',
                    marginBottom: '16px',
                    borderBottom: `2px solid ${themeColor}`
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: themeColor, textTransform: 'uppercase' }}>
                            {title || "Confirm Delete"}
                        </div>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#888',
                                fontSize: '24px',
                                cursor: 'pointer',
                                padding: '0',
                                lineHeight: 1
                            }}
                        >
                            &times;
                        </button>
                    </div>
                </div>

                <div style={{ margin: '15px 0' }}>
                    <div style={{ color: '#ccc', fontSize: '15px', lineHeight: '1.5', marginBottom: '15px' }}>
                        {message ? message : "Are you sure you want to delete this item?"}
                    </div>

                    {requireMatchingText && (
                        <div style={{ marginTop: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '11px', color: '#ff5252', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                Type "{requireMatchingText}" to confirm
                            </label>
                            <input
                                type="text"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder={`Type "${requireMatchingText}"`}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2a2a2a',
                                    border: `1px solid ${isConfirmDisabled ? '#444' : '#4caf50'}`,
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontSize: '14px',
                                    outline: 'none'
                                }}
                                autoFocus
                            />
                        </div>
                    )}

                    <div style={{ color: '#ff5252', fontSize: '12px', marginTop: '15px', background: 'rgba(255, 82, 82, 0.1)', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                        ⚠️ This action cannot be undone.
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #333', marginTop: '10px' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            background: 'transparent',
                            border: '1px solid #555',
                            borderRadius: '4px',
                            color: '#aaa',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isConfirmDisabled}
                        style={{
                            padding: '8px 20px',
                            background: isConfirmDisabled ? '#444' : themeColor,
                            color: isConfirmDisabled ? '#888' : 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isConfirmDisabled ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold'
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
