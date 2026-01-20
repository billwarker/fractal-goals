import React, { useState, useEffect } from 'react';
import { fractalApi } from '../../utils/api';

/**
 * AnnotationsList - Displays all annotations for a given visualization
 * 
 * @param {object} props
 * @param {string} props.rootId - The root goal/tree ID
 * @param {string} props.visualizationType - Type of visualization (scatter, line, timeline, etc.)
 * @param {object} props.context - Additional context (e.g., activity_id)
 */
function AnnotationsList({ rootId, visualizationType, context = {}, isAnnotating, onToggleAnnotationMode, highlightedAnnotationId, onHighlight }) {
    const [annotations, setAnnotations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const contextKey = JSON.stringify(context);

    useEffect(() => {
        const loadAnnotations = async () => {
            if (!rootId) {
                console.log('AnnotationsList: No rootId provided');
                setAnnotations([]);
                setLoading(false);
                return;
            }

            if (!visualizationType) {
                console.log('AnnotationsList: No visualizationType provided');
                setAnnotations([]);
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(null);

                console.log('AnnotationsList: Loading annotations', { rootId, visualizationType, context });

                // Fetch annotations for this visualization type and context
                const response = await fractalApi.getAnnotations(
                    rootId,
                    visualizationType,
                    context
                );

                console.log('AnnotationsList: Loaded', response.data?.data?.length || 0, 'annotations');
                setAnnotations(response.data?.data || []);
            } catch (err) {
                console.error('Failed to load annotations:', err);
                // Show more informative error
                const errorMessage = err.response?.data?.error
                    || err.response?.statusText
                    || err.message
                    || 'Failed to load annotations';
                setError(errorMessage);
                setAnnotations([]);
            } finally {
                setLoading(false);
            }
        };

        loadAnnotations();
    }, [rootId, visualizationType, contextKey]);

    const handleDeleteAnnotation = async (annotationId) => {
        try {
            await fractalApi.deleteAnnotation(rootId, annotationId);
            setAnnotations(prev => prev.filter(a => a.id !== annotationId));

            // Dispatch event to notify other components
            window.dispatchEvent(new CustomEvent('annotation-update'));
        } catch (err) {
            console.error('Failed to delete annotation:', err);
        }
    };

    // Listen for external updates
    useEffect(() => {
        const handleUpdate = () => {
            // Reload annotations
            if (rootId && visualizationType) {
                const load = async () => {
                    try {
                        setLoading(true);
                        const response = await fractalApi.getAnnotations(rootId, visualizationType, context);
                        setAnnotations(response.data?.data || []);
                    } catch (err) {
                        console.error(err);
                    } finally {
                        setLoading(false);
                    }
                };
                load();
            }
        };
        window.addEventListener('annotation-update', handleUpdate);
        return () => window.removeEventListener('annotation-update', handleUpdate);
    }, [rootId, visualizationType, JSON.stringify(context)]);

    // Check if visualization type requires specific context
    const requiresActivityContext = visualizationType === 'scatter' || visualizationType === 'line';
    const hasActivityContext = context?.activity_id;

    if (!visualizationType) {
        return (
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontSize: '14px',
                flexDirection: 'column',
                gap: '12px',
                padding: '20px',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '32px', opacity: 0.5 }}>📝</div>
                <div>Select a visualization in the left window to view its annotations</div>
            </div>
        );
    }

    // Activity visualizations require an activity to be selected
    if (requiresActivityContext && !hasActivityContext) {
        return (
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontSize: '14px',
                flexDirection: 'column',
                gap: '12px',
                padding: '20px',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '32px', opacity: 0.5 }}>📊</div>
                <div>Select an activity in the left window to view activity-specific annotations</div>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontSize: '14px'
            }}>
                Loading annotations...
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                color: '#ff6b6b',
                fontSize: '14px',
                gap: '8px',
                padding: '20px',
                textAlign: 'center'
            }}>
                <div>{error}</div>
                <div style={{ fontSize: '12px', color: '#888' }}>
                    Check that the backend server is running
                </div>
            </div>
        );
    }

    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid #333',
                background: '#252525',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start'
            }}>
                <div>
                    <h3 style={{
                        margin: 0,
                        color: '#ccc',
                        fontSize: '15px',
                        fontWeight: 600
                    }}>
                        Annotations ({annotations.length})
                    </h3>
                    <div style={{
                        fontSize: '12px',
                        color: '#666',
                        marginTop: '4px'
                    }}>
                        {getVisualizationName(visualizationType)}
                        {context.activity_id && ' - Activity View'}
                    </div>
                </div>

                {onToggleAnnotationMode && (
                    <button
                        onClick={onToggleAnnotationMode}
                        style={{
                            padding: '6px 12px',
                            background: isAnnotating ? '#2196f3' : 'rgba(50, 50, 50, 0.4)',
                            border: isAnnotating ? '1px solid #1976d2' : '1px solid #444',
                            borderRadius: '4px',
                            color: isAnnotating ? 'white' : '#aaa',
                            fontSize: '11px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span>✏️</span>
                        <span>{isAnnotating ? 'Done' : 'Annotate'}</span>
                    </button>
                )}
            </div>

            {/* Content Area */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px'
            }}>
                {annotations.length === 0 ? (
                    <div style={{
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#666',
                        fontSize: '14px',
                        flexDirection: 'column',
                        gap: '12px',
                        padding: '20px',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '32px', opacity: 0.5 }}>📝</div>
                        <div>No annotations for this visualization</div>
                        <div style={{ fontSize: '12px', color: '#555' }}>
                            Click "Annotate" above or drag on the chart to add notes
                        </div>
                    </div>
                ) : (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        paddingLeft: '16px',
                        position: 'relative'
                    }}>
                        {/* Vertical Line */}
                        <div style={{
                            position: 'absolute',
                            left: '0',
                            top: '0',
                            bottom: '0',
                            width: '2px',
                            background: '#333',
                            marginLeft: '8px'
                        }} />

                        {annotations.map(annotation => (
                            <div key={annotation.id} style={{ position: 'relative', marginBottom: '16px', paddingLeft: '24px' }}>
                                {/* Timeline Dot */}
                                <div style={{
                                    position: 'absolute',
                                    left: '4px',
                                    top: '16px',
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: '#2196f3',
                                    border: '2px solid #1e1e1e', // Match bg
                                    zIndex: 2
                                }} />

                                <AnnotationCard
                                    annotation={annotation}
                                    onDelete={handleDeleteAnnotation}
                                    isHighlighted={highlightedAnnotationId === annotation.id}
                                    onClick={() => onHighlight && onHighlight(annotation.id)}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * AnnotationCard - Individual annotation display
 */
function AnnotationCard({ annotation, onDelete, isHighlighted, onClick }) {
    const [isHovered, setIsHovered] = useState(false);

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                background: isHighlighted ? 'rgba(33, 150, 243, 0.1)' : '#252525',
                border: isHighlighted ? '1px solid #2196f3' : '1px solid #333',
                borderRadius: '6px',
                padding: '12px 14px',
                position: 'relative',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                ...(isHovered && !isHighlighted && {
                    borderColor: '#444',
                    background: '#2a2a2a'
                }),
                ...(isHighlighted && {
                    boxShadow: '0 0 0 1px rgba(33, 150, 243, 0.1)'
                })
            }}
        >
            {/* Delete button */}
            {isHovered && (
                <button
                    onClick={() => onDelete(annotation.id)}
                    style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: '#5c3030',
                        border: '1px solid #744',
                        borderRadius: '4px',
                        color: '#ff6b6b',
                        fontSize: '11px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.background = '#6c3535';
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.background = '#5c3030';
                    }}
                >
                    Delete
                </button>
            )}

            {/* Annotation text */}
            <div style={{
                color: '#eee',
                fontSize: '13px',
                lineHeight: '1.5',
                marginBottom: '8px',
                paddingRight: '60px'
            }}>
                {annotation.content}
            </div>

            {/* Metadata */}
            <div style={{
                display: 'flex',
                gap: '12px',
                fontSize: '11px',
                color: '#666'
            }}>
                <span>{formatDate(annotation.created_at)}</span>
                {annotation.selected_points && annotation.selected_points.length > 0 && (
                    <span>• {annotation.selected_points.length} point{annotation.selected_points.length !== 1 ? 's' : ''}</span>
                )}
            </div>
        </div>
    );
}

/**
 * Helper to get human-readable visualization name
 */
function getVisualizationName(type) {
    const names = {
        scatter: 'Scatter Plot',
        line: 'Line Graph',
        timeline: 'Completion Timeline',
        distribution: 'Time Distribution',
        bar: 'Weekly Bar Chart',
        heatmap: 'Activity Heatmap',
        goalDetail: 'Goal Detail View',
        goalStats: 'Goal Summary Stats',
        sessionStats: 'Session Summary Stats',
        streaks: 'Streak Timeline'
    };
    return names[type] || type;
}

export default AnnotationsList;
