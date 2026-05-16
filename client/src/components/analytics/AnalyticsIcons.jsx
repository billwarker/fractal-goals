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

export function AnalyticsGoalIcon({ goal, getGoalColor, getGoalSecondaryColor, getGoalIcon, size = 16, className = '' }) {
    return (
        <GoalIcon
            size={size}
            shape={getGoalIcon?.(goal || 'UltimateGoal') || 'circle'}
            color={getGoalColor?.(goal || 'UltimateGoal') || 'var(--color-brand-primary)'}
            secondaryColor={getGoalSecondaryColor?.(goal || 'UltimateGoal') || 'var(--color-bg-card)'}
            isSmart={Boolean(goal?.is_smart)}
            className={className}
        />
    );
}
