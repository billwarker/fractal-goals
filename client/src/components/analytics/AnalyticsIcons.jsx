import React from 'react';

import GoalIcon from '../atoms/GoalIcon';

export function LightningIcon({ size = 16, className = '', ...props }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
            <path d="M13.2 2.8 4.8 13.1h6.1l-1.2 8.1 9.5-11.7h-6.4l.4-6.7Z" fill="currentColor" />
        </svg>
    );
}

export function TimerIcon({ size = 16, className = '', ...props }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
            <path d="M9 2.75h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M12 7.5v5l3.1 2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17.5 5.8 19 4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M12 21.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5Z" stroke="currentColor" strokeWidth="1.8" />
        </svg>
    );
}

export function ChartIcon({ size = 16, className = '', ...props }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
            <path d="M4 19.25h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M6.5 16.5v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M12 16.5v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M17.5 16.5v-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function VisualizationIcon({ type, size = 16, className = '', ...props }) {
    const common = {
        className,
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': true,
        ...props,
    };

    switch (type) {
        case 'goals:stats':
            return (
                <svg {...common}>
                    <path d="M5 18.5h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M7 16v-4.5M12 16V7.5M17 16v-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M6.5 5.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
            );
        case 'goals:completionTimeline':
            return (
                <svg {...common}>
                    <path d="M5 6.5h14M5 12h14M5 17.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
                    <path d="M7 17.5 11 12l3 2.4 3-7.9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            );
        case 'goals:timeDistribution':
            return (
                <svg {...common}>
                    <path d="M12 4.5a7.5 7.5 0 1 1-6.4 11.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M12 4.5v7.5h7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            );
        case 'goals:completionRateByLevel':
            return (
                <svg {...common}>
                    <path d="M5 18h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M6.5 15.5h3v2.5h-3zM10.5 11.5h3v6.5h-3zM14.5 7h3v11h-3z" stroke="currentColor" strokeWidth="1.5" />
                    <path d="m16 5.5 1.5 1.5 2-2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            );
        case 'goals:goalAging':
            return (
                <svg {...common}>
                    <path d="M12 5v7l4 2.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 21a9 9 0 1 0-7.3-3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M4 13.5H2.5V18H7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            );
        case 'goals:goalMomentum':
            return (
                <svg {...common}>
                    <path d="M4 17.5h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M6 15.5 10 11l3 2.5 5-7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M15.5 6.5H18v2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            );
        case 'goals:staleGoals':
            return (
                <svg {...common}>
                    <path d="M6.5 6.5h11v11h-11z" stroke="currentColor" strokeWidth="1.7" />
                    <path d="M9 10h6M9 14h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M17.5 4.5 19.5 2.5M19.5 6.5l2-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
                </svg>
            );
        case 'goals:goalDetail':
            return (
                <svg {...common}>
                    <path d="M12 3.8 19.1 8v8L12 20.2 4.9 16V8L12 3.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="M8.5 12h7M12 8.5v7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
            );
        case 'sessions:stats':
            return (
                <svg {...common}>
                    <path d="M5 19V5M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M8 16v-3M12 16V8M16 16v-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
            );
        case 'sessions:sessionTrends':
            return (
                <svg {...common}>
                    <path d="M4.5 18.5h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M6.5 15.5v-5M10 15.5v-8M13.5 15.5v-3M17 15.5v-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M6.5 10.5 10 7.5l3.5 5 3.5-3" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
                </svg>
            );
        case 'sessions:sectionPie':
            return (
                <svg {...common}>
                    <path d="M12 4.5v7.5h7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M19.5 12A7.5 7.5 0 1 1 12 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
            );
        case 'sessions:streaks':
            return (
                <svg {...common}>
                    <path d="M5 16.5c1.7-4.7 4.1-4.7 5.8-1.5 1.4 2.6 3.5 2.3 5-.6 1-2 1.7-4.4 2.2-7.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M4.5 19h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
            );
        case 'sessions:startDistribution':
            return (
                <svg {...common}>
                    <path d="M12 4.5v7.2l4.4-2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 21a8.5 8.5 0 1 0 0-17" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M5 17.5h3M4 12h3M5 6.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            );
        case 'sessions:durationHistogram':
            return (
                <svg {...common}>
                    <path d="M4.5 18.5h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M6 15.5h2.5v3H6zM10.2 10h2.5v8.5h-2.5zM14.4 13h2.5v5.5h-2.5z" stroke="currentColor" strokeWidth="1.5" />
                </svg>
            );
        case 'activities:scatterPlot':
            return (
                <svg {...common}>
                    <path d="M5 19V5M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <circle cx="9" cy="14" r="1.5" fill="currentColor" />
                    <circle cx="13" cy="10" r="1.5" fill="currentColor" />
                    <circle cx="17" cy="7" r="1.5" fill="currentColor" />
                </svg>
            );
        case 'activities:activityTrends':
            return (
                <svg {...common}>
                    <path d="M5 18V6M5 18h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M7 15 10.5 11.5l3.2 2.2 4.1-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            );
        case 'activities:activityFrequency':
            return (
                <svg {...common}>
                    <path d="M5 18.5V5.5M5 18.5h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M7.5 8h10M7.5 12h7M7.5 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
            );
        case 'activities:metricTrends':
            return (
                <svg {...common}>
                    <path d="M5 18V6M5 18h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M7 14.5 10 10.5l3 2.4 4-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            );
        case 'activities:metricProgress':
            return (
                <svg {...common}>
                    <path d="M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M7 8h2.2v4H7zM10.9 12h2.2v4h-2.2zM14.8 6h2.2v6h-2.2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
            );
        case 'activities:groupMix':
            return (
                <svg {...common}>
                    <path d="M6.5 7.5h4v4h-4zM13.5 7.5h4v4h-4zM10 14.5h4v4h-4z" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M10.5 9.5h3M8.5 11.5l2 3M15.5 11.5l-2 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
            );
        default:
            return <ChartIcon size={size} className={className} {...props} />;
    }
}

export function HomeIcon({ size = 16, className = '', ...props }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
            <path d="M4 11.2 12 4l8 7.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6.5 10.4v8.3h4.1v-4.8h2.8v4.8h4.1v-8.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function BackIcon({ size = 16, className = '', ...props }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
            <path d="M10.5 6 4.5 12l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.5 12H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function SplitIcon({ size = 16, className = '', ...props }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
            <rect x="4.5" y="5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
            <path d="M12 5v14M4.5 12h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
    );
}

export function MinimizeHeaderIcon({ size = 16, className = '', ...props }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
            <path d="M5 7.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="m8.5 13 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function RestoreHeaderIcon({ size = 16, className = '', ...props }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
            <path d="M5 16.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="m8.5 11 3.5-3.5 3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function AnalyticsGoalIcon({ goal, getGoalSecondaryColor, getGoalIcon, size = 16, className = '' }) {
    return (
        <GoalIcon
            size={size}
            shape={getGoalIcon?.(goal || 'UltimateGoal') || 'circle'}
            color="var(--color-text-muted)"
            secondaryColor={getGoalSecondaryColor?.(goal || 'UltimateGoal') || 'var(--color-bg-card)'}
            isSmart={Boolean(goal?.is_smart)}
            className={className}
        />
    );
}
