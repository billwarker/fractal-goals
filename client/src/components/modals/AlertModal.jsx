import React from 'react';

const AlertModal = ({ isOpen, onClose, title, message }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                {title && <h2>{title}</h2>}
                <div style={{ margin: '15px 0', color: '#ccc' }}>
                    {message}
                </div>
                <div className="actions" style={{ justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="action-btn primary"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertModal;
