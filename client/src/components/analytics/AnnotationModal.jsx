import React, { useState } from 'react';
import useIsMobile from '../../hooks/useIsMobile';
import styles from './AnnotationModal.module.css';

/**
 * AnnotationModal - Modal for creating/editing visualization annotations.
 *
 * @param {boolean} isOpen - Whether the modal is open
 * @param {Function} onClose - Callback when modal is closed
 * @param {Function} onSave - Callback when annotation is saved: (content) => void
 * @param {Array} selectedPoints - The data points that were selected
 * @param {string} visualizationType - Type of visualization being annotated
 * @param {string} initialContent - Initial content for editing existing annotations
 */
function AnnotationModal({
    isOpen,
    onClose,
    onSave,
    selectedPoints = [],
    visualizationType = 'visualization',
    initialContent = ''
}) {
    const [draftContent, setDraftContent] = useState(null);
    const isMobile = useIsMobile();
    const content = draftContent ?? initialContent;

    const handleClose = () => {
        setDraftContent(null);
        onClose();
    };

    const handleSave = () => {
        if (content.trim()) {
            onSave(content.trim());
            setDraftContent(null);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && e.metaKey) {
            e.preventDefault();
            handleSave();
        }
        if (e.key === 'Escape') {
            handleClose();
        }
    };

    if (!isOpen) return null;

    // Format selected points for display
    const formatSelectedPoints = () => {
        if (selectedPoints.length === 0) {
            return 'Chart area selected';
        }

        // Check for area selection marker
        if (selectedPoints.length === 1 && selectedPoints[0].type === 'area_selection') {
            return 'Chart area selected';
        }

        if (visualizationType === 'heatmap') {
            // For heatmap, points are date strings
            const dates = selectedPoints.slice(0, 5);
            const more = selectedPoints.length > 5 ? ` and ${selectedPoints.length - 5} more` : '';
            return dates.join(', ') + more;
        }

        // Default: show count
        return `${selectedPoints.length} data point${selectedPoints.length !== 1 ? 's' : ''} selected`;
    };

    return (
        <div
            className={`${styles.overlay} ${isMobile ? styles.overlayMobile : ''}`}
            onClick={handleClose}
        >
            <div
                className={`${styles.container} ${isMobile ? styles.containerMobile : ''}`}
                onClick={e => e.stopPropagation()}
            >
                <div className={styles.header}>
                    <h3 className={styles.title}>✏️ Add Annotation</h3>
                    <button className={styles.closeBtn} onClick={handleClose}>✕</button>
                </div>

                <div className={styles.selectedDataBox}>
                    <div className={styles.selectedDataLabel}>Selected Data</div>
                    <div className={styles.selectedDataValue}>{formatSelectedPoints()}</div>
                </div>

                <textarea
                    autoFocus
                    className={styles.textarea}
                    value={content}
                    onChange={(e) => setDraftContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add your insight or note about this data..."
                />

                <div className={styles.hint}>Press ⌘+Enter to save quickly</div>

                <div className={`${styles.actions} ${isMobile ? styles.actionsMobile : ''}`}>
                    <button className={styles.cancelBtn} onClick={handleClose}>
                        Cancel
                    </button>
                    <button
                        className={`${styles.saveBtn} ${content.trim() ? styles.saveBtnActive : styles.saveBtnDisabled}`}
                        onClick={handleSave}
                        disabled={!content.trim()}
                    >
                        Save Annotation
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AnnotationModal;
