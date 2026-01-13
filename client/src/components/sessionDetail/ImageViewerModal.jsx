/**
 * ImageViewerModal - Full-screen modal for viewing note images
 * 
 * Opens when clicking on an image in a note, with a close button.
 */

import React, { useEffect } from 'react';
import './ImageViewerModal.css';

function ImageViewerModal({ imageData, onClose }) {
    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Stop click propagation on the modal body to prevent accidental closes
    const handleModalClick = (e) => {
        e.stopPropagation();
    };

    return (
        <div className="image-viewer-overlay" onClick={onClose}>
            <div className="image-viewer-modal" onClick={handleModalClick}>
                <button
                    className="image-viewer-close"
                    onClick={onClose}
                    title="Close (Esc)"
                >
                    ×
                </button>
                <div className="image-viewer-content">
                    <img
                        src={imageData}
                        alt="Note image"
                        className="image-viewer-img"
                    />
                </div>
            </div>
        </div>
    );
}

export default ImageViewerModal;
