import React, { useState, useEffect, useRef } from 'react';

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
    const [content, setContent] = useState(initialContent);
    const textareaRef = useRef(null);

    // Focus textarea when modal opens
    useEffect(() => {
        if (isOpen && textareaRef.current) {
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Reset content when modal opens with new data
    useEffect(() => {
        if (isOpen) {
            setContent(initialContent);
        }
    }, [initialContent, isOpen]);

    const handleSave = () => {
        if (content.trim()) {
            onSave(content.trim());
            setContent('');
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && e.metaKey) {
            e.preventDefault();
            handleSave();
        }
        if (e.key === 'Escape') {
            onClose();
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
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#1e1e1e',
                    border: '1px solid #333',
                    borderRadius: '12px',
                    padding: '24px',
                    width: '500px',
                    maxWidth: '90vw',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px'
                }}>
                    <h3 style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: 600,
                        color: '#fff'
                    }}>
                        ✏️ Add Annotation
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#888',
                            fontSize: '18px',
                            cursor: 'pointer',
                            padding: '4px 8px'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Selected points info */}
                <div style={{
                    background: '#252525',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px'
                }}>
                    <div style={{
                        fontSize: '11px',
                        color: '#888',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '4px'
                    }}>
                        Selected Data
                    </div>
                    <div style={{
                        fontSize: '13px',
                        color: '#2196f3',
                        fontWeight: 500
                    }}>
                        {formatSelectedPoints()}
                    </div>
                </div>

                {/* Content textarea */}
                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add your insight or note about this data..."
                    style={{
                        width: '100%',
                        height: '120px',
                        padding: '12px',
                        background: '#252525',
                        border: '1px solid #444',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        outline: 'none',
                        boxSizing: 'border-box'
                    }}
                />

                {/* Hint */}
                <div style={{
                    fontSize: '11px',
                    color: '#666',
                    marginTop: '8px',
                    marginBottom: '16px'
                }}>
                    Press ⌘+Enter to save quickly
                </div>

                {/* Actions */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px',
                            background: '#333',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#aaa',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!content.trim()}
                        style={{
                            padding: '10px 20px',
                            background: content.trim() ? '#2196f3' : '#444',
                            border: 'none',
                            borderRadius: '6px',
                            color: content.trim() ? 'white' : '#888',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: content.trim() ? 'pointer' : 'not-allowed'
                        }}
                    >
                        Save Annotation
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AnnotationModal;
