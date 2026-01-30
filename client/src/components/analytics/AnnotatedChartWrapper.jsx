import React, { useState, useRef, useCallback, useEffect } from 'react';
import AnnotationModal from './AnnotationModal';
import { fractalApi } from '../../utils/api';
import notify from '../../utils/notify';

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
    onSetAnnotationMode,
    highlightedAnnotationId
}) {
    const containerRef = useRef(null);

    // Annotation state
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionStart, setSelectionStart] = useState(null);
    const [selectionEnd, setSelectionEnd] = useState(null);
    const [selectedPoints, setSelectedPoints] = useState([]);
    const selectedPointsRef = useRef([]); // Ref to avoid stale closure in mouseup handler
    const [showModal, setShowModal] = useState(false);
    const [annotations, setAnnotations] = useState([]);
    const [viewingAnnotation, setViewingAnnotation] = useState(null);

    // Memoize context string to prevent infinite loops if parent passes new object every render
    const contextStr = JSON.stringify(context);

    // Load existing annotations
    const loadAnnotations = useCallback(async () => {
        try {
            const response = await fractalApi.getAnnotations(rootId, visualizationType, context);
            // API returns { data: [...] } structure
            const annotationsArray = response.data?.data || response.data || [];
            setAnnotations(Array.isArray(annotationsArray) ? annotationsArray : []);
        } catch (err) {
            console.error('Failed to load annotations:', err);
        }
    }, [rootId, visualizationType, contextStr]);

    useEffect(() => {
        if (rootId) {
            loadAnnotations();
        }
    }, [rootId, loadAnnotations]);

    // Helper to reset selection state
    const resetSelection = () => {
        setSelectionStart(null);
        setSelectionEnd(null);
        setSelectedPoints([]);
    };

    // Save annotation
    const saveAnnotation = async (content) => {
        // Use ref to get latest selected points (avoids stale closure)
        const currentSelectedPoints = selectedPointsRef.current;
        console.log('Saving annotation:', { content, currentSelectedPoints, selectionStart, selectionEnd });

        try {
            const chart = chartRef?.current;

            // Convert pixel bounds to data value bounds for persistence
            let dataValueBounds = null;
            if (chart && selectionStart && selectionEnd) {
                const chartCanvas = chart.canvas;
                const canvasRect = chartCanvas.getBoundingClientRect();
                const containerRect = containerRef.current.getBoundingClientRect();
                const offsetX = canvasRect.left - containerRect.left;
                const offsetY = canvasRect.top - containerRect.top;

                // Pixel bounds relative to canvas
                const pixelX1 = Math.min(selectionStart.x, selectionEnd.x) - offsetX;
                const pixelX2 = Math.max(selectionStart.x, selectionEnd.x) - offsetX;
                const pixelY1 = Math.min(selectionStart.y, selectionEnd.y) - offsetY;
                const pixelY2 = Math.max(selectionStart.y, selectionEnd.y) - offsetY;

                // Convert pixel coordinates to data values using chart scales
                const xScale = chart.scales.x;
                const yScale = chart.scales.y;

                if (xScale && yScale) {
                    // getValueForPixel converts pixel position to data value
                    const xMin = xScale.getValueForPixel(pixelX1);
                    const xMax = xScale.getValueForPixel(pixelX2);
                    const yMin = yScale.getValueForPixel(pixelY2); // Note: Y is inverted in canvas
                    const yMax = yScale.getValueForPixel(pixelY1);

                    dataValueBounds = {
                        xMin: xMin instanceof Date ? xMin.toISOString() : xMin,
                        xMax: xMax instanceof Date ? xMax.toISOString() : xMax,
                        yMin,
                        yMax
                    };
                    console.log('Converted to data value bounds:', dataValueBounds);
                }
            }

            // Ensure selected points have their data values properly serialized
            const pointsToSave = currentSelectedPoints.length > 0
                ? currentSelectedPoints.map(pt => ({
                    datasetIndex: pt.datasetIndex,
                    index: pt.index,
                    datasetLabel: pt.datasetLabel,
                    // Serialize the value, handling Date objects
                    value: pt.value ? {
                        x: pt.value.x instanceof Date ? pt.value.x.toISOString() : pt.value.x,
                        y: pt.value.y
                    } : null
                }))
                : [{ type: 'area_selection' }];

            const response = await fractalApi.createAnnotation(rootId, {
                visualization_type: visualizationType,
                visualization_context: context,
                selected_points: pointsToSave,
                selection_bounds: dataValueBounds, // Now stores DATA VALUES, not pixels
                content
            });

            console.log('Annotation saved successfully:', response.data);

            const data = response.data?.data || response.data;
            setAnnotations(prev => [data, ...(Array.isArray(prev) ? prev : [])]);
            setShowModal(false);
            resetSelection();
            if (onSetAnnotationMode) onSetAnnotationMode(false);

            // Dispatch event to notify other components
            window.dispatchEvent(new CustomEvent('annotation-update'));
        } catch (err) {
            console.error('Failed to save annotation:', err);
            notify.error('Failed to save annotation: ' + (err.response?.data?.error || err.message));
        }
    };

    // Listen for external updates
    useEffect(() => {
        const handleUpdate = () => loadAnnotations();
        window.addEventListener('annotation-update', handleUpdate);
        return () => window.removeEventListener('annotation-update', handleUpdate);
    }, [loadAnnotations]);

    // Ref to store original point colors for restoration
    const originalColorsRef = useRef(null);

    // Highlight color for annotated points - using magenta/pink to avoid chart color conflicts
    const HIGHLIGHT_COLOR = '#e91e63'; // Pink/magenta
    const HIGHLIGHT_BORDER = '#c2185b'; // Darker pink border

    // Effect to highlight points when an annotation is selected from the list
    useEffect(() => {
        console.log('=== Highlight Effect Triggered ===');
        console.log('highlightedAnnotationId:', highlightedAnnotationId);
        console.log('annotations count:', annotations?.length);
        console.log('chartRef.current exists:', !!chartRef?.current);

        if (!chartRef?.current) {
            console.log('No chartRef, exiting');
            return;
        }
        const chart = chartRef.current;

        // Helper to restore original colors (handles both bar and point-based charts)
        const restoreOriginalColors = () => {
            if (originalColorsRef.current) {
                chart.data.datasets.forEach((dataset, dIdx) => {
                    const origColors = originalColorsRef.current[dIdx];
                    if (origColors) {
                        // Restore bar chart properties if they exist
                        if ('backgroundColor' in origColors) {
                            dataset.backgroundColor = origColors.backgroundColor;
                            dataset.borderColor = origColors.borderColor;
                            dataset.borderWidth = origColors.borderWidth;
                        }
                        // Restore point chart properties if they exist
                        if ('pointBackgroundColor' in origColors) {
                            dataset.pointBackgroundColor = origColors.pointBackgroundColor;
                            dataset.pointBorderColor = origColors.pointBorderColor;
                            dataset.pointRadius = origColors.pointRadius;
                        }
                    }
                });
                originalColorsRef.current = null;
            }
        };

        // If no highlight, clear active elements and restore colors
        if (!highlightedAnnotationId) {
            restoreOriginalColors();
            chart.setActiveElements([]);
            chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            chart.update();
            return;
        }

        // Find the annotation
        const annotation = annotations.find(a => a.id === highlightedAnnotationId);
        console.log('Found annotation:', annotation ? 'YES' : 'NO');
        console.log('Annotation IDs in local state:', annotations.map(a => a.id));

        if (annotation?.selected_points) {
            console.log('Annotation selected_points:', annotation.selected_points);
            const pointsToHighlight = [];

            annotation.selected_points.forEach((pt, ptIndex) => {
                console.log(`Processing point ${ptIndex}:`, pt);

                // Skip placeholder area selections
                if (pt.type === 'area_selection') {
                    console.log('  Skipping area_selection placeholder');
                    return;
                }

                let match = null;

                // Strategy 1: Explicit Index
                console.log('  Checking Strategy 1 - datasetIndex:', pt.datasetIndex, 'index:', pt.index);
                if (typeof pt.datasetIndex !== 'undefined' && typeof pt.index !== 'undefined') {
                    // Start by checking if the index is valid
                    const dataset = chart.data.datasets[pt.datasetIndex];
                    console.log('  Dataset found:', !!dataset, 'Data at index:', dataset?.data?.[pt.index]);
                    if (dataset && dataset.data[pt.index]) {
                        match = { datasetIndex: pt.datasetIndex, index: pt.index };
                        console.log('  Strategy 1 matched!');
                    }
                }

                // Strategy 2: Value/Label Matching (Fallback)
                if (!match) {
                    const targetVal = pt.value || pt;
                    const targetX = targetVal.x;
                    const targetY = targetVal.y;

                    if (targetX !== undefined && targetY !== undefined) {
                        // Search all datasets
                        chart.data.datasets.forEach((dataset, dIdx) => {
                            if (match) return; // Stop if already found

                            // Filter by dataset label if available to reduce false positives
                            if (pt.datasetLabel && dataset.label !== pt.datasetLabel) return;

                            // Skip hidden datasets
                            if (chart.isDatasetVisible && chart.isDatasetVisible(dIdx) === false) return;

                            dataset.data.forEach((p, pIdx) => {
                                if (match) return;

                                const pX = p.x;
                                const pY = p.y;

                                // Check X Match: Handle String, Number, and Date equality
                                let xMatch = String(pX) === String(targetX);

                                // If X is a Date object (LineGraph), compare timestamps with saved ISO string
                                if (!xMatch && pX instanceof Date) {
                                    const targetDate = new Date(targetX);
                                    if (!isNaN(targetDate.getTime())) {
                                        xMatch = pX.getTime() === targetDate.getTime();
                                    }
                                }

                                // Check Y Match: Handle Number epsilon or loose string equality
                                let yMatch = false;
                                if (typeof pY === 'number' && typeof targetY === 'number') {
                                    yMatch = Math.abs(pY - targetY) < 0.0001;
                                } else {
                                    yMatch = String(pY) === String(targetY);
                                }

                                if (xMatch && yMatch) {
                                    match = { datasetIndex: dIdx, index: pIdx };
                                }
                            });
                        });
                    }
                }

                if (match) {
                    pointsToHighlight.push(match);
                } else {
                    console.warn('Highlight: Could not find matching point for', pt);
                }
            });

            // FALLBACK: If no points matched but we have selection_bounds (data value bounds), find points within those bounds
            if (pointsToHighlight.length === 0 && annotation.selection_bounds) {
                console.log('Using selection_bounds fallback (data values):', annotation.selection_bounds);
                const bounds = annotation.selection_bounds;

                // Check if bounds are in new data value format (xMin/xMax) vs old pixel format (x1/x2)
                const isDataValueBounds = bounds.xMin !== undefined || bounds.xMax !== undefined;

                if (isDataValueBounds) {
                    // Parse date bounds if they're ISO strings
                    const xMin = bounds.xMin ? (typeof bounds.xMin === 'string' && bounds.xMin.includes('T') ? new Date(bounds.xMin).getTime() : bounds.xMin) : -Infinity;
                    const xMax = bounds.xMax ? (typeof bounds.xMax === 'string' && bounds.xMax.includes('T') ? new Date(bounds.xMax).getTime() : bounds.xMax) : Infinity;
                    const yMin = bounds.yMin ?? -Infinity;
                    const yMax = bounds.yMax ?? Infinity;

                    // Find all points within the data value bounds
                    chart.data.datasets.forEach((dataset, dIdx) => {
                        const meta = chart.getDatasetMeta(dIdx);
                        if (!meta.hidden) {
                            dataset.data.forEach((point, pIdx) => {
                                // Get the data value (handle Date objects)
                                const pointX = point.x instanceof Date ? point.x.getTime() : point.x;
                                const pointY = point.y;

                                // Check if point falls within bounds
                                if (pointX >= xMin && pointX <= xMax && pointY >= yMin && pointY <= yMax) {
                                    pointsToHighlight.push({ datasetIndex: dIdx, index: pIdx });
                                }
                            });
                        }
                    });
                } else {
                    // Legacy: pixel-based bounds (won't work well but kept for backwards compat)
                    chart.data.datasets.forEach((dataset, dIdx) => {
                        const meta = chart.getDatasetMeta(dIdx);
                        if (!meta.hidden) {
                            meta.data.forEach((element, pIdx) => {
                                if (element.x >= bounds.x1 && element.x <= bounds.x2 &&
                                    element.y >= bounds.y1 && element.y <= bounds.y2) {
                                    pointsToHighlight.push({ datasetIndex: dIdx, index: pIdx });
                                }
                            });
                        }
                    });
                }
                console.log('Found points via bounds fallback:', pointsToHighlight.length);
            }

            // Apply highlighting if we have points
            if (pointsToHighlight.length > 0) {
                console.log('Highlighting found points:', pointsToHighlight.length);

                // First restore any previous highlight colors
                restoreOriginalColors();

                // Store original colors before modifying
                originalColorsRef.current = {};

                // Detect chart type from the first dataset's type or chart config
                const chartType = chart.config.type || chart.data.datasets[0]?.type || 'scatter';
                const isBarChart = chartType === 'bar';

                chart.data.datasets.forEach((dataset, dIdx) => {
                    const dataLength = dataset.data.length;

                    if (isBarChart) {
                        // Bar chart: store backgroundColor and borderColor
                        originalColorsRef.current[dIdx] = {
                            backgroundColor: dataset.backgroundColor,
                            borderColor: dataset.borderColor,
                            borderWidth: dataset.borderWidth
                        };

                        // Get original colors (handle both single value and array)
                        const origBgColor = Array.isArray(dataset.backgroundColor)
                            ? dataset.backgroundColor
                            : dataset.backgroundColor || '#2196f3';
                        const origBorderColor = Array.isArray(dataset.borderColor)
                            ? dataset.borderColor
                            : dataset.borderColor || '#1976d2';

                        // Create color arrays with highlight colors for matching bars
                        const bgColors = new Array(dataLength).fill(null).map((_, i) =>
                            Array.isArray(origBgColor) ? origBgColor[i] || origBgColor[0] : origBgColor
                        );
                        const borderColors = new Array(dataLength).fill(null).map((_, i) =>
                            Array.isArray(origBorderColor) ? origBorderColor[i] || origBorderColor[0] : origBorderColor
                        );
                        const borderWidths = new Array(dataLength).fill(dataset.borderWidth || 1);

                        // Apply highlight to matching bars in this dataset
                        pointsToHighlight.forEach(pt => {
                            if (pt.datasetIndex === dIdx) {
                                bgColors[pt.index] = HIGHLIGHT_COLOR;
                                borderColors[pt.index] = HIGHLIGHT_BORDER;
                                borderWidths[pt.index] = 3; // Thicker border for highlight
                            }
                        });

                        dataset.backgroundColor = bgColors;
                        dataset.borderColor = borderColors;
                        dataset.borderWidth = borderWidths;
                    } else {
                        // Scatter/Line chart: store point properties
                        originalColorsRef.current[dIdx] = {
                            pointBackgroundColor: dataset.pointBackgroundColor,
                            pointBorderColor: dataset.pointBorderColor,
                            pointRadius: dataset.pointRadius
                        };

                        // Create arrays for individual point styling
                        const origBgColor = dataset.pointBackgroundColor || dataset.borderColor || '#2196f3';
                        const origBorderColor = dataset.pointBorderColor || dataset.borderColor || '#1976d2';
                        const origRadius = dataset.pointRadius || 4;

                        // Create color arrays with highlight colors for matching points
                        const bgColors = new Array(dataLength).fill(origBgColor);
                        const borderColors = new Array(dataLength).fill(origBorderColor);
                        const radii = new Array(dataLength).fill(origRadius);

                        // Apply highlight to matching points in this dataset
                        pointsToHighlight.forEach(pt => {
                            if (pt.datasetIndex === dIdx) {
                                bgColors[pt.index] = HIGHLIGHT_COLOR;
                                borderColors[pt.index] = HIGHLIGHT_BORDER;
                                radii[pt.index] = (typeof origRadius === 'number' ? origRadius : 4) + 2;
                            }
                        });

                        dataset.pointBackgroundColor = bgColors;
                        dataset.pointBorderColor = borderColors;
                        dataset.pointRadius = radii;
                    }
                });

                chart.setActiveElements(pointsToHighlight);
                chart.tooltip.setActiveElements(pointsToHighlight, { x: 0, y: 0 });
                chart.update();
            } else {
                console.log('No points to highlight');
            }
        }
    }, [highlightedAnnotationId, annotations, chartRef]);

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

        console.log('Annotation drag started at:', { x, y });

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

            // Get the chart's canvas offset within our container
            const chartCanvas = chart.canvas;
            const canvasRect = chartCanvas.getBoundingClientRect();
            const containerRect = containerRef.current.getBoundingClientRect();
            const offsetX = canvasRect.left - containerRect.left;
            const offsetY = canvasRect.top - containerRect.top;

            // Adjust bounds to be relative to the canvas
            const bounds = {
                x1: Math.min(selectionStart.x, x) - offsetX,
                y1: Math.min(selectionStart.y, y) - offsetY,
                x2: Math.max(selectionStart.x, x) - offsetX,
                y2: Math.max(selectionStart.y, y) - offsetY
            };

            const points = getPointsInSelection(chart, bounds);
            if (points.length > 0) {
                console.log('Points found during drag:', points.length, 'Bounds:', bounds);
            }
            selectedPointsRef.current = points; // Keep ref in sync
            setSelectedPoints(points);
        }
    };

    const handleMouseUp = useCallback(() => {
        if (!isSelecting) return;
        setIsSelecting(false);

        // Calculate selection size
        const selectionWidth = Math.abs((selectionEnd?.x || 0) - (selectionStart?.x || 0));
        const selectionHeight = Math.abs((selectionEnd?.y || 0) - (selectionStart?.y || 0));
        const hasValidSelection = selectionWidth > 10 && selectionHeight > 10;

        // Use ref to get latest selectedPoints (avoids stale closure)
        const capturedPoints = selectedPointsRef.current;

        console.log('Annotation drag ended:', {
            capturedPointsCount: capturedPoints.length,
            selectionWidth,
            selectionHeight,
            hasValidSelection,
            capturedPoints
        });

        // Show modal if we have points OR if we have a valid selection area
        if (capturedPoints.length > 0 || hasValidSelection) {
            setShowModal(true);
        }

        // Keep the selection bounds for saving, don't reset to null yet
        // Only reset after modal closes
    }, [isSelecting, selectionStart, selectionEnd]);

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


            {/* Existing Annotations List Removed - Handled by Side Panel */}

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
                    resetSelection();
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
