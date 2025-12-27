
import React from 'react';

/**
 * ConfirmationModal Component
 * A reusable modal for confirming actions.
 */
function ConfirmationModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel' }) {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100
        }}>
            <div style={{
                background: '#1e1e1e',
                border: '1px solid #444',
                borderRadius: '8px',
                padding: '24px',
                maxWidth: '400px',
                width: '90%',
                textAlign: 'center'
            }}>
                <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', color: 'white' }}>
                    {title}
                </h2>
                <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#ccc', lineHeight: '1.5' }}>
                    {message}
                </p>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px',
                            background: '#333',
                            border: '1px solid #555',
                            borderRadius: '4px',
                            color: '#e0e0e0',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 500
                        }}
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        style={{
                            padding: '10px 20px',
                            background: '#d32f2f',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 600
                        }}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ConfirmationModal;
