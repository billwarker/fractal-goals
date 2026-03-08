import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../../utils/api';
import AnnotationModal from './AnnotationModal';
import { queryKeys } from '../../hooks/queryKeys';
import useIsMobile from '../../hooks/useIsMobile';
import styles from './AnnotatedHeatmap.module.css';

/**
 * AnnotatedHeatmap - ActivityHeatmap with annotation support.
 * 
 * Wraps the heatmap with selection capabilities and persists annotations to the backend.
 */
function AnnotatedHeatmap({
    sessions = [],
    months = 12,
    rootId,
    highlightedAnnotationId,
}) {
    const queryClient = useQueryClient();
    const containerRef = useRef(null);
    const cellRefs = useRef({}); // Store refs to each cell for hit detection
    const isMobile = useIsMobile();

    // Annotation state
    const [annotationMode, setAnnotationMode] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionStart, setSelectionStart] = useState(null);
    const [selectionEnd, setSelectionEnd] = useState(null);
    const [selectedDates, setSelectedDates] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [viewingAnnotation, setViewingAnnotation] = useState(null);

    // Heatmap data state (we'll compute this like ActivityHeatmap does)
    const [hoveredCell, setHoveredCell] = useState(null);

    // Ensure sessions is always an array
    const safeSessions = React.useMemo(
        () => (Array.isArray(sessions) ? sessions : []),
        [sessions]
    );

    // Process sessions into daily counts
    const { dailyData, weeks, maxCount, monthLabels } = React.useMemo(() => {
        try {
            const today = new Date();
            today.setHours(23, 59, 59, 999);

            const startDate = new Date(today);
            startDate.setMonth(startDate.getMonth() - months);
            startDate.setDate(startDate.getDate() - startDate.getDay());
            startDate.setHours(0, 0, 0, 0);

            const countMap = {};
            safeSessions.forEach(session => {
                const sessionDate = session?.session_start || session?.created_at;
                if (!sessionDate) return;
                const date = new Date(sessionDate);
                if (isNaN(date.getTime())) return; // Skip invalid dates
                const dateKey = date.toISOString().split('T')[0];
                countMap[dateKey] = (countMap[dateKey] || 0) + 1;
            });

            const allDays = [];
            const current = new Date(startDate);
            while (current <= today) {
                const dateKey = current.toISOString().split('T')[0];
                allDays.push({
                    date: new Date(current),
                    dateKey,
                    count: countMap[dateKey] || 0,
                    dayOfWeek: current.getDay()
                });
                current.setDate(current.getDate() + 1);
            }

            const weeksArray = [];
            let currentWeek = [];

            allDays.forEach((day, index) => {
                if (index === 0 && day.dayOfWeek > 0) {
                    for (let i = 0; i < day.dayOfWeek; i++) {
                        currentWeek.push(null);
                    }
                }
                currentWeek.push(day);
                if (day.dayOfWeek === 6 || index === allDays.length - 1) {
                    while (currentWeek.length < 7) {
                        currentWeek.push(null);
                    }
                    weeksArray.push(currentWeek);
                    currentWeek = [];
                }
            });

            const max = Math.max(1, ...allDays.map(d => d.count));

            const labels = [];
            let lastMonth = -1;
            weeksArray.forEach((week, weekIndex) => {
                const firstDayOfWeek = week.find(d => d !== null);
                if (firstDayOfWeek) {
                    const month = firstDayOfWeek.date.getMonth();
                    if (month !== lastMonth) {
                        labels.push({
                            weekIndex,
                            label: firstDayOfWeek.date.toLocaleDateString('en-US', { month: 'short' })
                        });
                        lastMonth = month;
                    }
                }
            });

            return { dailyData: allDays, weeks: weeksArray, maxCount: max, monthLabels: labels };
        } catch (err) {
            console.error('Error processing heatmap data:', err);
            // Return empty data structure on error
            return { dailyData: [], weeks: [], maxCount: 1, monthLabels: [] };
        }
    }, [safeSessions, months]);

    const context = { time_range: months };
    const contextKey = JSON.stringify(context);
    const annotationsQuery = useQuery({
        queryKey: queryKeys.annotations(rootId, 'heatmap', contextKey),
        enabled: Boolean(rootId),
        queryFn: async () => {
            const response = await fractalApi.getAnnotations(rootId, 'heatmap', context);
            const annotationsData = response.data?.data || response.data || [];
            return Array.isArray(annotationsData) ? annotationsData : [];
        },
    });
    const annotations = annotationsQuery.data || [];

    const createAnnotationMutation = useMutation({
        mutationFn: async (content) => fractalApi.createAnnotation(rootId, {
            visualization_type: 'heatmap',
            visualization_context: context,
            selected_points: selectedDates,
            content,
        }),
        onSuccess: (response) => {
            const data = response.data?.data || response.data;
            queryClient.setQueryData(
                queryKeys.annotations(rootId, 'heatmap', contextKey),
                (current = []) => [data, ...current]
            );
            setShowModal(false);
            setSelectedDates([]);
            setAnnotationMode(false);
            window.dispatchEvent(new CustomEvent('annotation-update'));
        },
    });

    const saveAnnotation = async (content) => {
        try {
            await createAnnotationMutation.mutateAsync(content);
        } catch (err) {
            console.error('Failed to save annotation:', err);
        }
    };

    useEffect(() => {
        const handleUpdate = () => {
            if (rootId) {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.annotations(rootId, 'heatmap', contextKey),
                });
            }
        };
        window.addEventListener('annotation-update', handleUpdate);
        return () => window.removeEventListener('annotation-update', handleUpdate);
    }, [contextKey, queryClient, rootId]);

    // Get color intensity based on count
    const getColor = (count, isSelected = false, isHighlighted = false) => {
        if (isSelected) return 'var(--color-brand-primary)';
        if (isHighlighted) return 'var(--color-warning)';
        if (count === 0) return 'var(--color-bg-input)';

        const intensity = count / maxCount;
        if (intensity <= 0.25) return '#0e4429';
        if (intensity <= 0.5) return '#006d32';
        if (intensity <= 0.75) return '#26a641';
        return '#39d353';
    };

    const cellSize = 14;
    const cellGap = 3;
    const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    // Check if a date is in any saved annotation
    const isDateAnnotated = (dateKey) => {
        if (!Array.isArray(annotations)) return false;
        return annotations.some(a => a.selected_points?.includes(dateKey));
    };

    // Check if a date is in the currently highlighted annotation
    const isDateHighlighted = (dateKey) => {
        if (!highlightedAnnotationId || !Array.isArray(annotations)) return false;
        const highlighted = annotations.find(a => a.id === highlightedAnnotationId);
        return highlighted?.selected_points?.includes(dateKey);
    };

    // Mouse handlers for selection
    const handleMouseDown = (e) => {
        if (!annotationMode) return;

        const rect = containerRef.current.getBoundingClientRect();
        setIsSelecting(true);
        setSelectionStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        setSelectionEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        setSelectedDates([]);
    };

    const handleMouseMove = (e) => {
        if (!isSelecting || !annotationMode) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setSelectionEnd({ x, y });

        // Determine which cells are in the selection box
        const bounds = {
            x1: Math.min(selectionStart.x, x),
            y1: Math.min(selectionStart.y, y),
            x2: Math.max(selectionStart.x, x),
            y2: Math.max(selectionStart.y, y)
        };

        const selected = [];
        Object.entries(cellRefs.current).forEach(([dateKey, cellEl]) => {
            if (cellEl) {
                const cellRect = cellEl.getBoundingClientRect();
                const containerRect = containerRef.current.getBoundingClientRect();
                const cellX = cellRect.left - containerRect.left + cellRect.width / 2;
                const cellY = cellRect.top - containerRect.top + cellRect.height / 2;

                if (cellX >= bounds.x1 && cellX <= bounds.x2 &&
                    cellY >= bounds.y1 && cellY <= bounds.y2) {
                    selected.push(dateKey);
                }
            }
        });
        setSelectedDates(selected);
    };

    const handleMouseUp = useCallback(() => {
        if (!isSelecting) return;
        setIsSelecting(false);

        if (selectedDates.length > 0) {
            setShowModal(true);
        }

        setSelectionStart(null);
        setSelectionEnd(null);
    }, [isSelecting, selectedDates]);

    // Global mouse up listener
    useEffect(() => {
        if (isSelecting) {
            window.addEventListener('mouseup', handleMouseUp);
            return () => window.removeEventListener('mouseup', handleMouseUp);
        }
    }, [isSelecting, handleMouseUp]);

    // Removed getSelectionBoxStyle as it's handled by inline overrides + module.css

    const totalSessions = dailyData.reduce((sum, d) => sum + d.count, 0);
    const activeDays = dailyData.filter(d => d.count > 0).length;

    return (
        <div
            ref={containerRef}
            className={`${styles.container} ${annotationMode ? styles.annotationMode : styles.defaultMode}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
        >
            {/* Header */}
            <div className={styles.header}>
                <h3 className={styles.title}>
                    📅 Activity Heatmap
                </h3>
                <div className={styles.statsContainer}>
                    <div className={styles.statsText}>
                        <span><strong className={styles.statsSuccess}>{totalSessions}</strong> sessions</span>
                        <span><strong className={styles.statsPrimary}>{activeDays}</strong> active days</span>
                    </div>

                    {/* Annotation toggle */}
                    <button
                        onClick={() => {
                            setAnnotationMode(!annotationMode);
                            setSelectedDates([]);
                        }}
                        className={`${styles.toggleButton} ${annotationMode ? styles.toggleActive : styles.toggleInactive}`}
                    >
                        <span>✏️</span>
                        <span>{annotationMode ? 'Done' : 'Annotate'}</span>
                    </button>
                </div>
            </div>

            {/* Annotation mode instructions */}
            {annotationMode && (
                <div className={styles.instructions}>
                    🎯 Drag to select cells, then add your note about the selected data.
                </div>
            )}

            {/* Month labels */}
            <div className={styles.monthLabelsContainer}>
                {monthLabels.map((label, i) => (
                    <span
                        key={i}
                        className={styles.monthLabel}
                        style={{
                            left: `${label.weekIndex * (cellSize + cellGap)}px`,
                        }}
                    >
                        {label.label}
                    </span>
                ))}
            </div>

            {/* Grid */}
            <div className={styles.gridContainer}>
                {/* Day labels */}
                <div className={styles.dayLabelsColumn} style={{ gap: `${cellGap}px` }}>
                    {dayLabels.map((label, i) => (
                        <div
                            key={i}
                            className={styles.dayLabel}
                            style={{ height: `${cellSize}px` }}
                        >
                            {label}
                        </div>
                    ))}
                </div>

                {/* Heatmap grid */}
                <div className={styles.heatmapGrid} style={{ gap: `${cellGap}px` }}>
                    {weeks.map((week, weekIndex) => (
                        <div key={weekIndex} className={styles.weekColumn} style={{ gap: `${cellGap}px` }}>
                            {week.map((day, dayIndex) => {
                                const isSelected = day && selectedDates.includes(day.dateKey);
                                const isAnnotated = day && isDateAnnotated(day.dateKey);
                                const isHighlighted = day && isDateHighlighted(day.dateKey);

                                return (
                                    <div
                                        key={dayIndex}
                                        ref={day ? (el) => { cellRefs.current[day.dateKey] = el; } : null}
                                        className={`${styles.dayCell} ${hoveredCell === `${weekIndex}-${dayIndex}` ? styles.dayCellHovered : ''} ${isHighlighted ? styles.dayCellHighlighted : ''} ${isAnnotated && !isSelected && !isHighlighted ? styles.dayCellAnnotated : ''}`}
                                        style={{
                                            width: `${cellSize}px`,
                                            height: `${cellSize}px`,
                                            backgroundColor: day ? getColor(day.count, isSelected, isAnnotated || isHighlighted) : 'transparent',
                                            cursor: day ? 'pointer' : 'default',
                                        }}
                                        onMouseEnter={() => day && setHoveredCell(`${weekIndex}-${dayIndex}`)}
                                        onMouseLeave={() => setHoveredCell(null)}
                                        title={day ? `${formatDate(day.date)}: ${day.count} session${day.count !== 1 ? 's' : ''}` : ''}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div className={styles.legendContainer}>
                <span>Less</span>
                <div className={styles.legendBox} style={{ backgroundColor: 'var(--color-bg-input)' }} />
                {['#0e4429', '#006d32', '#26a641', '#39d353'].map((color, i) => (
                    <div key={i} className={styles.legendBox} style={{ backgroundColor: color }} />
                ))}
                <span>More</span>
            </div>

            {/* Selection box */}
            {isSelecting && selectionStart && selectionEnd && (
                <div
                    className={styles.selectionBox}
                    style={{
                        left: Math.min(selectionStart.x, selectionEnd.x),
                        top: Math.min(selectionStart.y, selectionEnd.y),
                        width: Math.abs(selectionEnd.x - selectionStart.x),
                        height: Math.abs(selectionEnd.y - selectionStart.y),
                    }}
                />
            )}

            {/* Selection count indicator */}
            {isSelecting && selectedDates.length > 0 && (
                <div
                    className={styles.selectionCount}
                    style={{
                        left: Math.max(selectionStart?.x || 0, selectionEnd?.x || 0) + 8,
                        top: Math.min(selectionStart?.y || 0, selectionEnd?.y || 0),
                    }}
                >
                    {selectedDates.length} day{selectedDates.length !== 1 ? 's' : ''}
                </div>
            )}

            {/* Saved annotations indicator */}
            {annotations.length > 0 && !annotationMode && (
                <div className={styles.annotationsIndicatorContainer}>
                    <span className={styles.annotationsText}>📝 {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}</span>
                    {annotations.slice(0, 3).map((a, i) => (
                        <button
                            key={a.id}
                            onClick={() => setViewingAnnotation(a)}
                            className={styles.annotationDot}
                            title={a.content}
                        >
                            {i + 1}
                        </button>
                    ))}
                </div>
            )}

            {/* Annotation modal */}
            <AnnotationModal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    setSelectedDates([]);
                }}
                onSave={saveAnnotation}
                selectedPoints={selectedDates}
                visualizationType="heatmap"
            />

            {/* Viewing annotation modal */}
            {viewingAnnotation && (
                <div
                    className={`${styles.viewingOverlay} ${isMobile ? styles.viewingOverlayMobile : styles.viewingOverlayDesktop}`}
                    onClick={() => setViewingAnnotation(null)}
                >
                    <div
                        className={`${styles.viewingModal} ${isMobile ? styles.viewingModalMobile : styles.viewingModalDesktop}`}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className={styles.viewingHeader}>
                            <h3 className={styles.viewingTitle}>📝 Annotation</h3>
                            <button
                                onClick={() => setViewingAnnotation(null)}
                                className={styles.viewingCloseBtn}
                            >
                                ✕
                            </button>
                        </div>
                        <div className={styles.viewingStats}>
                            {viewingAnnotation.selected_points?.length || 0} days selected
                        </div>
                        <div className={styles.viewingContent}>
                            {viewingAnnotation.content}
                        </div>
                        <div className={styles.viewingDate}>
                            Created: {new Date(viewingAnnotation.created_at).toLocaleString()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AnnotatedHeatmap;
