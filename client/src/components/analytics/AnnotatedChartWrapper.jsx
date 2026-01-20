import React, { useState, useRef, useCallback, useEffect } from 'react';
import AnnotationModal from './AnnotationModal';
import { fractalApi } from '../../utils/api';

/**
 * AnnotatedChartWrapper - Wraps Chart.js visualizations with annotation support.
 * 
 * @param {Function} renderChart - Function that renders the Chart.js component. 
 *                                 Must accept a `ref` prop to expose the chart instance.
 * @param {string} visualizationType - Type identifier ('scatter', 'line', 'bar')
 * @param {string} rootId - ID of the root goal
 * @param {object} context - Viz-specific context (e.g., activity_id)
 * @param {Function} getPointsInBounds - (chart, bounds) => points. Custom logic to find points.
 */
function AnnotatedChartWrapper({
    children,
    chartRef, // Ref object attached to the Chart component
    visualizationType,
    rootId,
    context = {},
    chartType = 'scatter', // 'scatter', 'cartesian'
    annotationMode = false,
    onSetAnnotationMode
}) {
    const containerRef = useRef(null);

    // Annotation state
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionStart, setSelectionStart] = useState(null);
    const [selectionEnd, setSelectionEnd] = useState(null);
    const [selectedPoints, setSelectedPoints] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [annotations, setAnnotations] = useState([]);
    const [viewingAnnotation, setViewingAnnotation] = useState(null);

    // Memoize context string to prevent infinite loops if parent passes new object every render
    const contextStr = JSON.stringify(context);

    // Load existing annotations
    const loadAnnotations = useCallback(async () => {
        try {
            const response = await fractalApi.getAnnotations(rootId, visualizationType, context);
            setAnnotations(response.data || []);
        } catch (err) {
            console.error('Failed to load annotations:', err);
        }
    }, [rootId, visualizationType, contextStr]);

    useEffect(() => {
        if (rootId) {
            loadAnnotations();
        }
    }, [rootId, loadAnnotations]);

    // Save annotation
    const saveAnnotation = async (content) => {
        try {
            const response = await fractalApi.createAnnotation(rootId, {
                visualization_type: visualizationType,
                visualization_context: context,
                selected_points: selectedPoints,
                selection_bounds: {
                    x1: Math.min(selectionStart.x, selectionEnd.x),
                    y1: Math.min(selectionStart.y, selectionEnd.y),
                    x2: Math.max(selectionStart.x, selectionEnd.x),
                    y2: Math.max(selectionStart.y, selectionEnd.y)
                },
                content
            });

            const data = response.data;
            setAnnotations(prev => [data, ...prev]);
            setShowModal(false);
            setSelectedPoints([]);
            if (onSetAnnotationMode) onSetAnnotationMode(false);

            // Dispatch event to notify other components
            window.dispatchEvent(new CustomEvent('annotation-update'));
        } catch (err) {
            console.error('Failed to save annotation:', err);
        }
    };

    // Listen for external updates
    useEffect(() => {
        const handleUpdate = () => loadAnnotations();
        window.addEventListener('annotation-update', handleUpdate);
        return () => window.removeEventListener('annotation-update', handleUpdate);
    }, [loadAnnotations]);

    // Generic logic to find points in bounds for Chart.js
    const getPointsInSelection = (chart, bounds) => {
        if (!chart) return [];

        const { x1, y1, x2, y2 } = bounds;
        const pts = [];

        // Loop through all datasets and points
        const datasets = chart.data.datasets;
        datasets.forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            if (!meta.hidden) {
                meta.data.forEach((element, index) => {
                    // element.x and element.y are pixel coordinates relative to chart area
                    if (element.x >= x1 && element.x <= x2 && element.y >= y1 && element.y <= y2) {
                        const rawData = dataset.data[index];
                        pts.push({
                            datasetIndex,
                            index,
                            value: rawData,
                            label: chart.data.labels ? chart.data.labels[index] : null,
                            datasetLabel: dataset.label
                        });
                    }
                });
            }
        });

        return pts;
    };

    // Mouse handlers
    const handleMouseDown = (e) => {
        if (!annotationMode) return;

        // Prevent default text selection
        e.preventDefault();

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setIsSelecting(true);
        setSelectionStart({ x, y });
        setSelectionEnd({ x, y });
        setSelectedPoints([]);
    };

    const handleMouseMove = (e) => {
        if (!isSelecting || !annotationMode) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setSelectionEnd({ x, y });

        if (chartRef && chartRef.current) {
            const chart = chartRef.current;
            const bounds = {
                x1: Math.min(selectionStart.x, x),
                y1: Math.min(selectionStart.y, y),
                x2: Math.max(selectionStart.x, x),
                y2: Math.max(selectionStart.y, y)
            };

            // Adjust bounds to be relative to chart area if needed?
            // Chart.js elements have x/y relative to canvas.
            // Our mouse coordinates are relative to the container.
            // Assuming the chart canvas fills the container.

            const points = getPointsInSelection(chart, bounds);
            setSelectedPoints(points);
        }
    };

    const handleMouseUp = useCallback(() => {
        if (!isSelecting) return;
        setIsSelecting(false);

        if (selectedPoints.length > 0) {
            setShowModal(true);
        }

        setSelectionStart(null);
        setSelectionEnd(null);
    }, [isSelecting, selectedPoints]);

    useEffect(() => {
        if (isSelecting) {
            window.addEventListener('mouseup', handleMouseUp);
            return () => window.removeEventListener('mouseup', handleMouseUp);
        }
    }, [isSelecting, handleMouseUp]);

    // Draw annotation indicators? 
    // For Chart.js, it's hard to overlay exact elements on data points without a plugin.
    // For now, we'll just list them at the bottom like the heatmap.

    // Selection box style
    const getSelectionBoxStyle = () => {
        if (!selectionStart || !selectionEnd) return null;
        return {
            position: 'absolute',
            left: Math.min(selectionStart.x, selectionEnd.x),
            top: Math.min(selectionStart.y, selectionEnd.y),
            width: Math.abs(selectionEnd.x - selectionStart.x),
            height: Math.abs(selectionEnd.y - selectionStart.y),
            border: '2px dashed #2196f3',
            backgroundColor: 'rgba(33, 150, 243, 0.15)',
            pointerEvents: 'none',
            zIndex: 100,
            borderRadius: '4px'
        };
    };

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                cursor: annotationMode ? 'crosshair' : 'default'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
        >


            {/* Existing Annotations List (Overlay) */}
            {!annotationMode && annotations.length > 0 && (
                <div style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: '10px',
                    zIndex: 10,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px',
                    maxWidth: '80%'
                }}>
                    {annotations.map((ann, i) => (
                        <button
                            key={ann.id}
                            onClick={() => setViewingAnnotation(ann)}
                            style={{
                                width: '22px',
                                height: '22px',
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
                            title={ann.content}
                        >
                            {i + 1}
                        </button>
                    ))}
                </div>
            )}

            {/* Selection Box */}
            {isSelecting && selectionStart && selectionEnd && (
                <div style={getSelectionBoxStyle()} />
            )}

            {/* Selection Count */}
            {isSelecting && selectedPoints.length > 0 && (
                <div style={{
                    position: 'absolute',
                    left: Math.max(selectionStart?.x || 0, selectionEnd?.x || 0) + 8,
                    top: Math.min(selectionStart?.y || 0, selectionEnd?.y || 0),
                    background: '#2196f3',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    pointerEvents: 'none',
                    zIndex: 101
                }}>
                    {selectedPoints.length} point{selectedPoints.length !== 1 ? 's' : ''}
                </div>
            )}

            {/* Helper Text */}
            {annotationMode && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(33, 150, 243, 0.9)',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    color: 'white',
                    fontSize: '11px',
                    pointerEvents: 'none',
                    zIndex: 10,
                    whiteSpace: 'nowrap'
                }}>
                    Drag to select data points
                </div>
            )}

            {/* The actual chart */}
            <div style={{ flex: 1, position: 'relative', width: '100%', minHeight: 0 }}>
                {children}
            </div>

            {/* Modals */}
            <AnnotationModal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    setSelectedPoints([]);
                }}
                onSave={saveAnnotation}
                selectedPoints={selectedPoints}
                visualizationType={visualizationType}
            />

            {/* Viewing annotation modal */}
            {viewingAnnotation && (
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
                    onClick={() => setViewingAnnotation(null)}
                >
                    <div
                        style={{
                            background: '#1e1e1e',
                            border: '1px solid #333',
                            borderRadius: '12px',
                            padding: '24px',
                            width: '450px',
                            maxWidth: '90vw'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>📝 {visualizationType} Annotation</h3>
                            <button
                                onClick={() => setViewingAnnotation(null)}
                                style={{ background: 'none', border: 'none', color: '#888', fontSize: '18px', cursor: 'pointer' }}
                            >
                                ✕
                            </button>
                        </div>
                        <div style={{
                            background: '#252525',
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '12px',
                            fontSize: '12px',
                            color: '#2196f3'
                        }}>
                            {viewingAnnotation.selected_points?.length || 0} data points selected
                        </div>
                        <div style={{ color: '#ccc', fontSize: '14px', lineHeight: 1.6 }}>
                            {viewingAnnotation.content}
                        </div>
                        <div style={{ marginTop: '12px', fontSize: '11px', color: '#666' }}>
                            Created: {new Date(viewingAnnotation.created_at).toLocaleString()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AnnotatedChartWrapper;
