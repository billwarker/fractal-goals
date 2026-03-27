import React from 'react';
import ReactDOM from 'react-dom';
import { Line, Bar } from 'react-chartjs-2';
import { useChartOptions } from './ChartJSWrapper'; // Import hook
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import GoalIcon from '../atoms/GoalIcon';
import styles from './GenericGraphModal.module.css';

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
    goalIcon,
    goalSecondaryColor,
    isSmart = false,
    graphData,
    options = {},
    type = 'line'
}) => {
    const {
        getGoalColor = () => '#4caf50',
        getGoalIcon = () => 'circle',
        getGoalSecondaryColor = () => '#2e7d32',
    } = useGoalLevels() || {};

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
    const effectiveGoalIcon = goalIcon || getGoalIcon(goalType) || 'circle';
    const effectiveSecondaryColor = goalSecondaryColor || getGoalSecondaryColor(goalType) || effectiveGoalColor;

    // Helper to get computed CSS variable value
    const getCSSVar = (name) => {
        if (typeof window !== 'undefined') {
            const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            return value || undefined;
        }
        return undefined;
    };

    const toRgba = (hexColor, alpha) => {
        if (!hexColor || typeof hexColor !== 'string' || !hexColor.startsWith('#')) {
            return hexColor;
        }

        const normalized = hexColor.length === 4
            ? `#${hexColor[1]}${hexColor[1]}${hexColor[2]}${hexColor[2]}${hexColor[3]}${hexColor[3]}`
            : hexColor;
        const red = parseInt(normalized.slice(1, 3), 16);
        const green = parseInt(normalized.slice(3, 5), 16);
        const blue = parseInt(normalized.slice(5, 7), 16);

        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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
            borderColor: idx === 0 ? effectiveGoalColor : '#2196f3',
            backgroundColor: idx === 0 ? toRgba(effectiveSecondaryColor, type === 'bar' ? 0.7 : 0.2) : 'rgba(33, 150, 243, 0.18)',
            pointBackgroundColor: idx === 0 ? effectiveGoalColor : '#2196f3',
            pointBorderColor: idx === 0 ? effectiveGoalColor : '#2196f3',
            pointRadius: type === 'bar' ? 0 : 4,
            pointHoverRadius: type === 'bar' ? 0 : 6,
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: idx === 0 ? effectiveGoalColor : '#2196f3',
            pointHoverBorderWidth: type === 'bar' ? 0 : 2,
            borderWidth: type === 'bar' ? 1 : 2,
            fill: type !== 'bar',
            tension: type === 'bar' ? 0 : 0.4,
            borderRadius: type === 'bar' ? 6 : undefined,
            maxBarThickness: type === 'bar' ? 28 : undefined
        }))
    } : null;

    return ReactDOM.createPortal(
        <div
            className={styles.overlay}
            onClick={onClose}
        >
            <div
                className={styles.container}
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
                        <GoalIcon
                            shape={effectiveGoalIcon}
                            color={effectiveGoalColor}
                            secondaryColor={effectiveSecondaryColor}
                            isSmart={isSmart}
                            size={44}
                        />

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
                        aria-label="Close"
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
