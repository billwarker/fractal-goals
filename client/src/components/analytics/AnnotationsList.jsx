import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';

/**
 * AnnotationsList - Displays all annotations for a given visualization
 * 
 * @param {object} props
 * @param {string} props.rootId - The root goal/tree ID
 * @param {string} props.visualizationType - Type of visualization (scatter, line, timeline, etc.)
 * @param {object} props.context - Additional context (e.g., activity_id)
 */
function AnnotationsList({ rootId, visualizationType, context = {}, isAnnotating, onToggleAnnotationMode, highlightedAnnotationId, onHighlight }) {
    const queryClient = useQueryClient();
    const contextKey = JSON.stringify(context);
    const annotationsQuery = useQuery({
        queryKey: queryKeys.annotations(rootId, visualizationType, contextKey),
        enabled: Boolean(rootId && visualizationType),
        retry: false,
        queryFn: async () => {
            const response = await fractalApi.getAnnotations(rootId, visualizationType, context);
            return response.data?.data || [];
        },
    });
    const annotations = annotationsQuery.data || [];
    const loading = rootId && visualizationType ? annotationsQuery.isLoading : false;
    const error = annotationsQuery.error
        ? (
            annotationsQuery.error.response?.data?.error
            || annotationsQuery.error.response?.statusText
            || annotationsQuery.error.message
            || 'Failed to load annotations'
        )
        : null;

    const handleDeleteAnnotation = async (annotationId) => {
        try {
            await fractalApi.deleteAnnotation(rootId, annotationId);
            queryClient.setQueryData(
                queryKeys.annotations(rootId, visualizationType, contextKey),
                (current = []) => current.filter((annotation) => annotation.id !== annotationId)
            );

            // Dispatch event to notify other components
            window.dispatchEvent(new CustomEvent('annotation-update'));
        } catch (err) {
            console.error('Failed to delete annotation:', err);
        }
    };

    // Listen for external updates
    useEffect(() => {
        const handleUpdate = () => {
            if (rootId && visualizationType) {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.annotations(rootId, visualizationType, contextKey),
                });
            }
        };
        window.addEventListener('annotation-update', handleUpdate);
        return () => window.removeEventListener('annotation-update', handleUpdate);
    }, [contextKey, queryClient, rootId, visualizationType]);

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
                color: 'var(--color-text-muted)',
                fontSize: '14px',
                flexDirection: 'column',
                gap: '12px',
                padding: '20px',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '32px', opacity: 0.5 }}>📝</div>
                <div>Select a visualization to see its annotations</div>
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
                color: 'var(--color-text-muted)',
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
                color: 'var(--color-text-secondary)',
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
                color: 'var(--color-error)',
                fontSize: '14px',
                gap: '8px',
                padding: '20px',
                textAlign: 'center'
            }}>
                <div>{error}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
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
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start'
            }}>
                <div>
                    <h3 style={{
                        margin: 0,
                        color: 'var(--color-text-secondary)',
                        fontSize: '15px',
                        fontWeight: 600
                    }}>
                        Annotations ({annotations.length})
                    </h3>
                    <div style={{
                        fontSize: '12px',
                        color: 'var(--color-text-muted)',
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
                            background: isAnnotating ? 'var(--color-brand-primary)' : 'var(--color-bg-surface)',
                            border: isAnnotating ? '1px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
                            borderRadius: '4px',
                            color: isAnnotating ? 'white' : 'var(--color-text-muted)',
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
                        color: 'var(--color-text-muted)',
                        fontSize: '14px',
                        flexDirection: 'column',
                        gap: '12px',
                        padding: '20px',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '32px', opacity: 0.5 }}>📝</div>
                        <div>No annotations for this visualization</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
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
                            background: 'var(--color-border)',
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
                                    background: 'var(--color-brand-primary)',
                                    border: '2px solid var(--color-bg-surface)', // Match visual bg
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
                background: isHighlighted ? 'rgba(33, 150, 243, 0.1)' : 'var(--color-bg-surface)',
                border: isHighlighted ? '1px solid var(--color-brand-primary)' : '1px solid var(--color-border)',
                borderRadius: '6px',
                padding: '12px 14px',
                position: 'relative',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                ...(isHovered && !isHighlighted && {
                    borderColor: 'var(--color-text-muted)',
                    background: 'var(--color-bg-secondary)'
                }),
                ...(isHighlighted && {
                    boxShadow: '0 0 0 1px rgba(33, 150, 243, 0.1)'
                })
            }}
        >
            {/* Delete button */}
            {isHovered && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(annotation.id);
                    }}
                    style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: 'transparent',
                        border: '1px solid var(--color-brand-danger)',
                        borderRadius: '4px',
                        color: 'var(--color-brand-danger)',
                        fontSize: '11px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        zIndex: 10
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.background = 'rgba(239, 68, 68, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.background = 'transparent';
                    }}
                >
                    Delete
                </button>
            )}

            {/* Annotation text */}
            <div style={{
                color: 'var(--color-text-primary)',
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
                color: 'var(--color-text-muted)'
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
