import React from 'react';

const DeleteProgramModal = ({ isOpen, onClose, onConfirm, programName, sessionCount }) => {
    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1100,
                padding: '20px'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#1e1e1e',
                    border: '1px solid #444',
                    borderRadius: '12px',
                    width: '100%',
                    maxWidth: '500px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '20px', color: 'white', fontWeight: 500 }}>
                        Delete Program
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#888',
                            fontSize: '24px',
                            cursor: 'pointer',
                            padding: '0 8px'
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '24px' }}>
                    <p style={{ color: '#ddd', fontSize: '15px', lineHeight: '1.6', margin: '0 0 16px 0' }}>
                        Are you sure you want to delete <strong style={{ color: 'white' }}>"{programName}"</strong>?
                    </p>

                    {sessionCount > 0 && (
                        <div style={{
                            background: '#2a1a1a',
                            border: '1px solid #d32f2f',
                            borderRadius: '6px',
                            padding: '16px',
                            marginTop: '16px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <span style={{ fontSize: '20px' }}>⚠️</span>
                                <div>
                                    <div style={{ color: '#ff6b6b', fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>
                                        Warning
                                    </div>
                                    <div style={{ color: '#ddd', fontSize: '14px', lineHeight: '1.5' }}>
                                        <strong style={{ color: 'white' }}>{sessionCount}</strong> session{sessionCount !== 1 ? 's' : ''} will lose their association to this program.
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '20px',
                    borderTop: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px',
                            background: 'transparent',
                            border: '1px solid #444',
                            color: 'white',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '10px 20px',
                            background: '#d32f2f',
                            border: 'none',
                            color: 'white',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '14px'
                        }}
                    >
                        Delete Program
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteProgramModal;
