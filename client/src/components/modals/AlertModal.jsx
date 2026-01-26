import React from 'react';

const AlertModal = ({ isOpen, onClose, title, message }) => {
    if (!isOpen) return null;

    const themeColor = '#3794ff';

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '400px', maxWidth: '90vw' }}>
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
                            {title || "Alert"}
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

                <div style={{ margin: '20px 0', color: '#ccc', lineHeight: '1.5', fontSize: '15px' }}>
                    {message}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #333' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '8px 24px',
                            background: themeColor,
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertModal;
