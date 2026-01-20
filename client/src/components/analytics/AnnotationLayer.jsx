import React, { useState, useRef, useCallback, useEffect } from 'react';

/**
 * AnnotationLayer - A wrapper component that adds annotation capabilities to visualizations.
 * 
 * Provides:
 * - Toggle for annotation mode
 * - Rectangle selection via mouse drag
 * - Callback when points are selected
 * - Display of existing annotations
 * 
 * @param {ReactNode} children - The visualization to wrap
 * @param {boolean} enabled - Whether annotation mode is currently enabled
 * @param {Function} onToggle - Callback when toggle button is clicked
 * @param {Function} onSelect - Callback when selection is complete: (bounds, pointsInBounds) => void
 * @param {Function} getPointsInBounds - Function to determine which data points are in selection bounds
 * @param {Array} annotations - Existing annotations to display
 * @param {Function} onAnnotationClick - Callback when an annotation indicator is clicked
 */
function AnnotationLayer({
    children,
    enabled = false,
    onToggle,
    onSelect,
    getPointsInBounds,
    annotations = [],
    onAnnotationClick,
    style = {}
}) {
    const containerRef = useRef(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionStart, setSelectionStart] = useState(null);
    const [selectionEnd, setSelectionEnd] = useState(null);
    const [selectedPoints, setSelectedPoints] = useState([]);

    // Handle mouse down - start selection
    const handleMouseDown = useCallback((e) => {
        if (!enabled) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setIsSelecting(true);
        setSelectionStart({ x, y });
        setSelectionEnd({ x, y });
        setSelectedPoints([]);
    }, [enabled]);

    // Handle mouse move - update selection rectangle
    const handleMouseMove = useCallback((e) => {
        if (!isSelecting || !enabled) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setSelectionEnd({ x, y });

        // Calculate which points are in the selection bounds
        if (getPointsInBounds && selectionStart) {
            const bounds = {
                x1: Math.min(selectionStart.x, x),
                y1: Math.min(selectionStart.y, y),
                x2: Math.max(selectionStart.x, x),
                y2: Math.max(selectionStart.y, y)
            };
            const points = getPointsInBounds(bounds);
            setSelectedPoints(points);
        }
    }, [isSelecting, enabled, selectionStart, getPointsInBounds]);

    // Handle mouse up - complete selection
    const handleMouseUp = useCallback(() => {
        if (!isSelecting || !enabled) return;

        if (selectionStart && selectionEnd) {
            const bounds = {
                x1: Math.min(selectionStart.x, selectionEnd.x),
                y1: Math.min(selectionStart.y, selectionEnd.y),
                x2: Math.max(selectionStart.x, selectionEnd.x),
                y2: Math.max(selectionStart.x, selectionEnd.y)
            };

            // Only trigger if we have a meaningful selection (not just a click)
            const width = bounds.x2 - bounds.x1;
            const height = bounds.y2 - bounds.y1;

            if (width > 10 && height > 10 && selectedPoints.length > 0) {
                onSelect?.(bounds, selectedPoints);
            }
        }

        setIsSelecting(false);
        setSelectionStart(null);
        setSelectionEnd(null);
        setSelectedPoints([]);
    }, [isSelecting, enabled, selectionStart, selectionEnd, selectedPoints, onSelect]);

    // Add global mouse up listener to handle mouse up outside container
    useEffect(() => {
        if (isSelecting) {
            const handleGlobalMouseUp = () => handleMouseUp();
            window.addEventListener('mouseup', handleGlobalMouseUp);
            return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
        }
    }, [isSelecting, handleMouseUp]);

    // Calculate selection rectangle styles
    const getSelectionBoxStyle = () => {
        if (!selectionStart || !selectionEnd) return null;

        return {
            position: 'absolute',
            left: Math.min(selectionStart.x, selectionEnd.x),
            top: Math.min(selectionStart.y, selectionEnd.y),
            width: Math.abs(selectionEnd.x - selectionStart.x),
            height: Math.abs(selectionEnd.y - selectionStart.y),
            border: '2px dashed #2196f3',
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            pointerEvents: 'none',
            zIndex: 100
        };
    };

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                ...style,
                cursor: enabled ? 'crosshair' : 'default'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
        >
            {/* The visualization */}
            {children}

            {/* Selection rectangle */}
            {isSelecting && selectionStart && selectionEnd && (
                <div style={getSelectionBoxStyle()} />
            )}

            {/* Selection count indicator */}
            {isSelecting && selectedPoints.length > 0 && (
                <div style={{
                    position: 'absolute',
                    left: Math.max(selectionStart?.x || 0, selectionEnd?.x || 0) + 8,
                    top: Math.min(selectionStart?.y || 0, selectionEnd?.y || 0),
                    background: '#2196f3',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    pointerEvents: 'none',
                    zIndex: 101
                }}>
                    {selectedPoints.length} point{selectedPoints.length !== 1 ? 's' : ''}
                </div>
            )}

            {/* Annotation mode toggle button */}
            <button
                onClick={onToggle}
                style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    padding: '6px 12px',
                    background: enabled ? '#2196f3' : 'rgba(50, 50, 50, 0.9)',
                    border: enabled ? '2px solid #1976d2' : '1px solid #555',
                    borderRadius: '4px',
                    color: enabled ? 'white' : '#aaa',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    zIndex: 50,
                    transition: 'all 0.2s ease'
                }}
                title={enabled ? 'Exit annotation mode' : 'Enter annotation mode to add notes'}
            >
                <span>✏️</span>
                <span>{enabled ? 'Done' : 'Annotate'}</span>
            </button>

            {/* Existing annotation indicators */}
            {annotations.length > 0 && !enabled && (
                <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '100px',
                    display: 'flex',
                    gap: '4px',
                    zIndex: 50
                }}>
                    {annotations.slice(0, 3).map((annotation, i) => (
                        <button
                            key={annotation.id}
                            onClick={() => onAnnotationClick?.(annotation)}
                            style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: '#ff9800',
                                border: '2px solid #f57c00',
                                color: 'white',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            title={annotation.content.substring(0, 50) + '...'}
                        >
                            {i + 1}
                        </button>
                    ))}
                    {annotations.length > 3 && (
                        <span style={{
                            fontSize: '11px',
                            color: '#888',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            +{annotations.length - 3}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

export default AnnotationLayer;
