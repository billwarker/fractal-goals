import React from 'react';
import ReactDOM from 'react-dom';
import { Line, Bar } from 'react-chartjs-2';
import { useChartOptions } from './ChartJSWrapper'; // Import hook
import { useTheme } from '../../contexts/ThemeContext';
import styles from '../GoalDetailModal.module.css'; // Reusing modal styles for consistency
import flowStyles from '../../FlowTree.module.css'; // Reusing node styles for goal icon
import '../../App.css'; // For global modal styles if needed

/**
 * Generic Graph Modal
 * 
 * A reusable modal component for displaying charts.
 */
const GenericGraphModal = ({
    isOpen,
    onClose,
    title,
    goalType,
    goalColor,
    graphData,
    options = {},
    type = 'line'
}) => {
    const { getGoalColor, getGoalSecondaryColor } = useTheme();

    // Theme-aware options
    const baseOptions = useChartOptions({
        title: '', // We use our own header title
        xAxisLabel: 'Date',
        yAxisLabel: 'Value',
        isTimeScale: true
    });

    if (!isOpen) return null;

    // Determine colors
    const effectiveGoalColor = goalColor || getGoalColor(goalType) || '#4caf50';
    const smartRingFillColor = getGoalSecondaryColor(goalType) || 'rgba(76, 175, 80, 0.1)';

    // Dataset color variables (readability first)
    const sessionColor = '#4caf50';
    const activityColor = '#2196f3';
    const sessionBg = 'rgba(76, 175, 80, 0.1)';
    const activityBg = 'rgba(33, 150, 243, 0.1)';

    // Helper to get computed CSS variable value
    const getCSSVar = (name) => {
        if (typeof window !== 'undefined') {
            const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            return value || undefined;
        }
        return undefined;
    };

    // Resolved colors for Chart.js (which doesn't support CSS variables)
    const textColor = getCSSVar('--color-text-secondary') || '#888';
    const mutedColor = getCSSVar('--color-text-muted') || '#666';
    const gridColor = getCSSVar('--color-border') || 'rgba(255, 255, 255, 0.1)';

    // Merge options and update dataset styles for theme consistency
    const finalOptions = {
        ...baseOptions,
        ...options,
        plugins: {
            ...baseOptions.plugins,
            ...options.plugins,
            title: { display: false },
            legend: {
                display: true,
                position: 'bottom',
                labels: {
                    color: textColor,
                    usePointStyle: true,
                    padding: 15,
                    font: { size: 12, weight: '500' }
                }
            },
            tooltip: {
                ...baseOptions.plugins.tooltip,
                backgroundColor: 'rgba(30, 30, 30, 0.95)',
                titleColor: '#fff',
                bodyColor: '#ccc',
                padding: 12,
                cornerRadius: 8,
                displayColors: true,
                ...options.plugins?.tooltip
            }
        },
        scales: {
            ...baseOptions.scales,
            ...options.scales,
            x: {
                ...(baseOptions.scales?.x || {}),
                ...(options.scales?.x || {}),
                type: 'time',
                time: {
                    unit: 'day',
                    displayFormats: { day: 'MMM d' }
                },
                title: {
                    ...(baseOptions.scales?.x?.title || {}),
                    ...(options.scales?.x?.title || {})
                },
                grid: {
                    color: gridColor,
                    display: true,
                    drawBorder: false,
                    opacity: 0.1
                },
                ticks: {
                    ...(baseOptions.scales?.x?.ticks || {}),
                    ...(options.scales?.x?.ticks || {}),
                    color: mutedColor,
                    maxRotation: 45,
                    minRotation: 45
                }
            },
            y: {
                ...(baseOptions.scales?.y || {}),
                ...(options.scales?.y || {}),
                beginAtZero: true,
                title: {
                    ...(baseOptions.scales?.y?.title || {}),
                    ...(options.scales?.y?.title || {})
                },
                grid: {
                    color: gridColor,
                    display: true,
                    drawBorder: false,
                    opacity: 0.1
                },
                ticks: {
                    ...(baseOptions.scales?.y?.ticks || {}),
                    ...(options.scales?.y?.ticks || {}),
                    color: mutedColor
                }
            }
        }
    };

    // Prepare graph data with theme-consistent colors
    const themedGraphData = graphData ? {
        ...graphData,
        datasets: graphData.datasets.map((ds, idx) => ({
            ...ds,
            borderColor: idx === 0 ? sessionColor : activityColor,
            backgroundColor: idx === 0 ? sessionBg : activityBg,
            pointBackgroundColor: idx === 0 ? sessionColor : activityColor,
            pointBorderColor: idx === 0 ? sessionColor : activityColor,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: idx === 0 ? sessionColor : activityColor,
            pointHoverBorderWidth: 2,
            borderWidth: 2,
            fill: true,
            tension: 0.4
        }))
    } : null;

    return ReactDOM.createPortal(
        <div
            className="modal-overlay"
            onClick={onClose}
            style={{
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.4)', // User requested not blacked out
                backdropFilter: 'blur(4px)'
            }}
        >
            <div
                style={{
                    width: '95%',
                    maxWidth: '1200px',
                    height: '85vh',
                    maxHeight: '900px',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '24px 32px', // Reduced top/bottom padding
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 50px 100px rgba(0,0,0,0.5)',
                    animation: 'modalFadeIn 0.3s ease-out',
                    borderRadius: '0' // USER: get rid of rounded edges
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px' // Significantly reduced margin
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        {/* Goal Icon - Favicon Bullseye Style */}
                        <svg width="44" height="44" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                            {/* Outer Ring */}
                            <circle cx="15" cy="15" r="13.75" fill={smartRingFillColor} stroke={effectiveGoalColor} strokeWidth="2.5" />
                            {/* Middle Ring */}
                            <circle cx="15" cy="15" r="8.75" fill={smartRingFillColor} stroke={effectiveGoalColor} strokeWidth="2.5" />
                            {/* Inner Core */}
                            <circle cx="15" cy="15" r="5" fill={effectiveGoalColor} />
                        </svg>

                        <h2 style={{
                            margin: 0,
                            fontSize: '1.6rem',
                            fontWeight: 'bold',
                            color: effectiveGoalColor, // USER: match goal color
                            letterSpacing: '-0.3px',
                            lineHeight: '1.2'
                        }}>
                            {title}
                        </h2>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-muted)',
                            fontSize: '32px', // USER: match style of large X
                            cursor: 'pointer',
                            padding: '0',
                            lineHeight: '1',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-text-primary)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-muted)'}
                    >
                        ×
                    </button>
                </div>

                {/* Chart Container */}
                <div style={{
                    flex: 1,
                    minHeight: 0,
                    position: 'relative',
                    background: 'var(--color-bg-card-alt)',
                    padding: '12px', // Reduced padding inside chart container
                    border: '1px solid var(--color-border)',
                    borderRadius: '0' // USER: get rid of rounded edges
                }}>
                    {themedGraphData ? (
                        type === 'bar' ? (
                            <Bar data={themedGraphData} options={finalOptions} />
                        ) : (
                            <Line data={themedGraphData} options={finalOptions} />
                        )
                    ) : (
                        <div style={{
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-text-muted)',
                            flexDirection: 'column',
                            gap: '15px'
                        }}>
                            <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: effectiveGoalColor, borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                            <span>Loading metrics...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default GenericGraphModal;
