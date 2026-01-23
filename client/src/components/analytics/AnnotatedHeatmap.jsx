import React, { useState, useRef, useEffect, useCallback } from 'react';
import { fractalApi } from '../../utils/api';
import AnnotationModal from './AnnotationModal';

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
    setHighlightedAnnotationId
}) {
    const containerRef = useRef(null);
    const cellRefs = useRef({}); // Store refs to each cell for hit detection

    // Annotation state
    const [annotationMode, setAnnotationMode] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionStart, setSelectionStart] = useState(null);
    const [selectionEnd, setSelectionEnd] = useState(null);
    const [selectedDates, setSelectedDates] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [annotations, setAnnotations] = useState([]);
    const [viewingAnnotation, setViewingAnnotation] = useState(null);

    // Heatmap data state (we'll compute this like ActivityHeatmap does)
    const [hoveredCell, setHoveredCell] = useState(null);

    // Ensure sessions is always an array
    const safeSessions = Array.isArray(sessions) ? sessions : [];

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

    // Define loadAnnotations first so it can be used in useEffect
    const loadAnnotations = useCallback(async () => {
        try {
            const context = { time_range: months };
            const response = await fractalApi.getAnnotations(rootId, 'heatmap', context);
            // API usually returns { status: 'success', data: [...] } or just [...]
            const annotationsData = response.data?.data || response.data || [];
            setAnnotations(Array.isArray(annotationsData) ? annotationsData : []);
        } catch (err) {
            console.error('Failed to load annotations:', err);
        }
    }, [rootId, months]);

    // Load existing annotations
    useEffect(() => {
        if (rootId) {
            loadAnnotations();
        }
    }, [rootId, months, loadAnnotations]);

    const saveAnnotation = async (content) => {
        try {
            const response = await fractalApi.createAnnotation(rootId, {
                visualization_type: 'heatmap',
                visualization_context: { time_range: months },
                selected_points: selectedDates,
                content
            });

            const data = response.data;
            setAnnotations(prev => [data, ...prev]);
            setShowModal(false);
            setSelectedDates([]);
            setAnnotationMode(false);
        } catch (err) {
            console.error('Failed to save annotation:', err);
        }
    };

    // Get color intensity based on count
    const getColor = (count, isSelected = false, isHighlighted = false) => {
        if (isSelected) return '#2196f3';
        if (isHighlighted) return '#ff9800';
        if (count === 0) return '#1a1a1a';

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

    const totalSessions = dailyData.reduce((sum, d) => sum + d.count, 0);
    const activeDays = dailyData.filter(d => d.count > 0).length;

    return (
        <div
            ref={containerRef}
            style={{
                background: '#1e1e1e',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '20px',
                position: 'relative',
                cursor: annotationMode ? 'crosshair' : 'default',
                userSelect: 'none'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
        >
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
            }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#ccc' }}>
                    📅 Activity Heatmap
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#888' }}>
                        <span><strong style={{ color: '#4caf50' }}>{totalSessions}</strong> sessions</span>
                        <span><strong style={{ color: '#2196f3' }}>{activeDays}</strong> active days</span>
                    </div>

                    {/* Annotation toggle */}
                    <button
                        onClick={() => {
                            setAnnotationMode(!annotationMode);
                            setSelectedDates([]);
                        }}
                        style={{
                            padding: '6px 12px',
                            background: annotationMode ? '#2196f3' : '#333',
                            border: annotationMode ? '2px solid #1976d2' : '1px solid #555',
                            borderRadius: '4px',
                            color: annotationMode ? 'white' : '#aaa',
                            fontSize: '11px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>✏️</span>
                        <span>{annotationMode ? 'Done' : 'Annotate'}</span>
                    </button>
                </div>
            </div>

            {/* Annotation mode instructions */}
            {annotationMode && (
                <div style={{
                    background: 'rgba(33, 150, 243, 0.1)',
                    border: '1px solid rgba(33, 150, 243, 0.3)',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    marginBottom: '16px',
                    fontSize: '12px',
                    color: '#2196f3'
                }}>
                    🎯 Drag to select cells, then add your note about the selected data.
                </div>
            )}

            {/* Month labels */}
            <div style={{ display: 'flex', marginLeft: '32px', marginBottom: '4px' }}>
                {monthLabels.map((label, i) => (
                    <span
                        key={i}
                        style={{
                            position: 'relative',
                            left: `${label.weekIndex * (cellSize + cellGap)}px`,
                            fontSize: '10px',
                            color: '#666',
                            marginRight: '-20px'
                        }}
                    >
                        {label.label}
                    </span>
                ))}
            </div>

            {/* Grid */}
            <div style={{ display: 'flex', gap: '4px' }}>
                {/* Day labels */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: `${cellGap}px`, marginRight: '4px' }}>
                    {dayLabels.map((label, i) => (
                        <div
                            key={i}
                            style={{
                                height: `${cellSize}px`,
                                fontSize: '9px',
                                color: '#666',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                width: '24px'
                            }}
                        >
                            {label}
                        </div>
                    ))}
                </div>

                {/* Heatmap grid */}
                <div style={{ display: 'flex', gap: `${cellGap}px`, overflowX: 'auto', paddingBottom: '4px' }}>
                    {weeks.map((week, weekIndex) => (
                        <div key={weekIndex} style={{ display: 'flex', flexDirection: 'column', gap: `${cellGap}px` }}>
                            {week.map((day, dayIndex) => {
                                const isSelected = day && selectedDates.includes(day.dateKey);
                                const isAnnotated = day && isDateAnnotated(day.dateKey);
                                const isHighlighted = day && isDateHighlighted(day.dateKey);

                                return (
                                    <div
                                        key={dayIndex}
                                        ref={day ? (el) => { cellRefs.current[day.dateKey] = el; } : null}
                                        style={{
                                            width: `${cellSize}px`,
                                            height: `${cellSize}px`,
                                            backgroundColor: day ? getColor(day.count, isSelected, isAnnotated || isHighlighted) : 'transparent',
                                            borderRadius: '2px',
                                            cursor: day ? 'pointer' : 'default',
                                            transition: 'all 0.1s ease',
                                            transform: (hoveredCell === `${weekIndex}-${dayIndex}` || isHighlighted) ? 'scale(1.2)' : 'scale(1)',
                                            border: (isAnnotated || isHighlighted) && !isSelected
                                                ? `1px solid ${isHighlighted ? '#ffeb3b' : '#ff9800'}`
                                                : 'none',
                                            boxShadow: isHighlighted ? '0 0 8px rgba(255, 235, 59, 0.6)' : 'none',
                                            zIndex: isHighlighted ? 1 : 0,
                                            boxSizing: 'border-box'
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
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '4px',
                marginTop: '12px',
                fontSize: '10px',
                color: '#666'
            }}>
                <span>Less</span>
                {['#1a1a1a', '#0e4429', '#006d32', '#26a641', '#39d353'].map((color, i) => (
                    <div key={i} style={{ width: '10px', height: '10px', backgroundColor: color, borderRadius: '2px' }} />
                ))}
                <span>More</span>
            </div>

            {/* Selection box */}
            {isSelecting && selectionStart && selectionEnd && (
                <div style={getSelectionBoxStyle()} />
            )}

            {/* Selection count indicator */}
            {isSelecting && selectedDates.length > 0 && (
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
                    {selectedDates.length} day{selectedDates.length !== 1 ? 's' : ''}
                </div>
            )}

            {/* Saved annotations indicator */}
            {annotations.length > 0 && !annotationMode && (
                <div style={{
                    position: 'absolute',
                    bottom: '12px',
                    left: '20px',
                    display: 'flex',
                    gap: '6px',
                    alignItems: 'center'
                }}>
                    <span style={{ fontSize: '11px', color: '#888' }}>📝 {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}</span>
                    {annotations.slice(0, 3).map((a, i) => (
                        <button
                            key={a.id}
                            onClick={() => setViewingAnnotation(a)}
                            style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                background: '#ff9800',
                                border: '2px solid #f57c00',
                                color: 'white',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
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
                            <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>📝 Annotation</h3>
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
                            {viewingAnnotation.selected_points?.length || 0} days selected
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

export default AnnotatedHeatmap;
