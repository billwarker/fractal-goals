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
function AnnotationsList({ rootId, visualizationType, context = {} }) {
    const [annotations, setAnnotations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const contextKey = JSON.stringify(context);

    useEffect(() => {
        const loadAnnotations = async () => {
            if (!rootId || !visualizationType) {
                setAnnotations([]);
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(null);

                // Fetch annotations for this visualization type and context
                const response = await fractalApi.getAnnotations(
                    rootId,
                    visualizationType,
                    context
                );

                setAnnotations(response.data || []);
            } catch (err) {
                console.error('Failed to load annotations:', err);
                setError('Failed to load annotations');
                setAnnotations([]);
            } finally {
                setLoading(false);
            }
        };

        loadAnnotations();
    }, [rootId, visualizationType, contextKey, context]);

    const handleDeleteAnnotation = async (annotationId) => {
        try {
            await fractalApi.deleteAnnotation(rootId, annotationId);
            setAnnotations(prev => prev.filter(a => a.id !== annotationId));
        } catch (err) {
            console.error('Failed to delete annotation:', err);
        }
    };

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
                color: '#ff6b6b',
                fontSize: '14px'
            }}>
                {error}
            </div>
        );
    }

    if (annotations.length === 0) {
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
                <div>No annotations for this visualization</div>
                <div style={{ fontSize: '12px', color: '#555' }}>
                    Click on the chart in the left window to add annotations
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
                background: '#252525'
            }}>
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

            {/* Annotations List */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px'
            }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                }}>
                    {annotations.map(annotation => (
                        <AnnotationCard
                            key={annotation.id}
                            annotation={annotation}
                            onDelete={handleDeleteAnnotation}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

/**
 * AnnotationCard - Individual annotation display
 */
function AnnotationCard({ annotation, onDelete }) {
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
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                background: '#252525',
                border: '1px solid #333',
                borderRadius: '6px',
                padding: '12px 14px',
                position: 'relative',
                transition: 'all 0.2s ease',
                ...(isHovered && {
                    borderColor: '#444',
                    background: '#2a2a2a'
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
                {annotation.text}
            </div>

            {/* Metadata */}
            <div style={{
                display: 'flex',
                gap: '12px',
                fontSize: '11px',
                color: '#666'
            }}>
                <span>{formatDate(annotation.created_at)}</span>
                {annotation.x_value !== undefined && (
                    <span>• X: {annotation.x_value}</span>
                )}
                {annotation.y_value !== undefined && (
                    <span>• Y: {annotation.y_value}</span>
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
        heatmap: 'Activity Heatmap'
    };
    return names[type] || type;
}

export default AnnotationsList;
