import React from 'react';
import lazyChart from '../../lazyChart';
import { Heading } from '../../../atoms/Typography';
import EmptyControls from '../shared/EmptyControls';
import GrainControl from '../shared/GrainControl';
import StatCard from '../shared/StatCard';
import { timeDistributionRollupRank } from './timeDistributionState';
import styles from '../../ProfileWindow.module.css';

const GoalAgingChart = lazyChart(() => import('../../AnalyticsExtraCharts').then((module) => ({ default: module.GoalAgingChart })));
const GoalCompletionRateByLevel = lazyChart(() => import('../../AnalyticsExtraCharts').then((module) => ({ default: module.GoalCompletionRateByLevel })));
const GoalMomentumChart = lazyChart(() => import('../../AnalyticsExtraCharts').then((module) => ({ default: module.GoalMomentumChart })));
const StaleGoalsChart = lazyChart(() => import('../../AnalyticsExtraCharts').then((module) => ({ default: module.StaleGoalsChart })));
const GoalTimeDistribution = lazyChart(() => import('../../GoalTimeDistribution'));
const GoalCompletionTimeline = lazyChart(() => import('../../GoalCompletionTimeline'));

function GoalSummaryChart({ context }) {
    const { scopedData, data } = context;
    const summary = scopedData.goalSummary;
    return (
        <div className={styles.vizContainer}>
            <Heading level={3} className={styles.vizTitle}>Goal Summary</Heading>
            <div className={styles.statsGrid}>
                <StatCard value={summary.completed_goals || 0} label="Completed" subLabel={`${summary.completion_rate?.toFixed(1) || 0}% rate`} color="#4caf50" />
                <StatCard value={`${summary.avg_goal_age_days || 0}d`} label="Avg Age" subLabel="Days old" color="#2196f3" />
                <StatCard value={`${summary.avg_time_to_completion_days || 0}d`} label="Avg to Complete" subLabel="Days" color="#ff9800" />
                <StatCard value={data.formatDuration(summary.avg_duration_to_completion_seconds || 0)} label="Avg Time" subLabel="Per goal" color="#9c27b0" />
            </div>
        </div>
    );
}

function GoalCompletionTimelineChart({ context }) {
    return <div className={styles.vizContainerHidden}><GoalCompletionTimeline goals={context.scopedData.goals} chartRef={context.chartRef} /></div>;
}

function GoalTimeDistributionChart({ context }) {
    return (
        <div className={styles.vizContainerHidden}>
            <GoalTimeDistribution
                timeRollup={context.scopedData.timeRollup}
                requestedGrain={context.visualizationState.grain || 'auto'}
                chartRef={context.chartRef}
                onFocusGoal={(focusGoalId) => context.updateVisualizationState({ focusGoalId })}
            />
        </div>
    );
}

/** The goal levels present, top first, as roll-up choices. */
function rollupLevelChoices(goals) {
    const byRank = new Map();
    goals.forEach((goal) => {
        if (Number.isInteger(goal.level_rank) && !byRank.has(goal.level_rank)) byRank.set(goal.level_rank, goal.level_name || goal.type);
    });
    return [...byRank.entries()].sort(([left], [right]) => left - right).map(([rank, label]) => ({ rank, label }));
}

function GoalCompletionRateByLevelChart({ context }) {
    return <div className={styles.vizContainerHidden}><GoalCompletionRateByLevel goals={context.scopedData.goals} chartRef={context.chartRef} /></div>;
}

function GoalAgingVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><GoalAgingChart goals={context.scopedData.goals} chartRef={context.chartRef} /></div>;
}

function GoalMomentumVisualizationChart({ context }) {
    return <div className={styles.vizContainerHidden}><GoalMomentumChart goals={context.scopedData.goals} chartRef={context.chartRef} /></div>;
}

function StaleGoalsVisualizationChart({ context }) {
    return (
        <div className={styles.vizContainer}>
            <StaleGoalsChart goals={context.scopedData.goals} rootId={context.data?.rootId} getGoalColor={context.getGoalTypeColor} />
        </div>
    );
}

export function GoalTimeDistributionControls({ context }) {
    const state = context.visualizationState;
    const levelOptions = rollupLevelChoices(context.profileGoals || []);
    const rank = timeDistributionRollupRank(state);
    return (
        <>
            <div className="sessions-query-chip-group">
                {[
                    { value: 'activity', label: 'Activities' },
                    { value: 'session', label: 'Sessions' },
                ].map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={`sessions-query-chip ${(state.durationMode || 'activity') === option.value ? 'active' : ''}`}
                        onClick={() => context.updateVisualizationState({ durationMode: option.value })}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <label className="sessions-query-field" style={{ marginTop: 12 }}>
                <span>Stack goals by level</span>
                <select
                    value={rank ?? ''}
                    onChange={(event) => context.updateVisualizationState({
                        rollupRank: event.target.value === '' ? null : Number(event.target.value), focusGoalId: null,
                    })}
                >
                    <option value="">Automatic</option>
                    {levelOptions.map((option) => (
                        <option key={option.rank} value={option.rank}>{option.label}</option>
                    ))}
                </select>
            </label>
            <GrainControl context={context} />
        </>
    );
}

export const GOAL_VISUALIZATIONS = [
    {
        id: 'stats',
        category: 'goals',
        name: 'Summary Stats',
        iconType: 'goals:stats',
        defaultState: {},
        selectionRequirements: {},
        Chart: GoalSummaryChart,
        Controls: EmptyControls,
    },
    {
        id: 'completionTimeline',
        category: 'goals',
        name: 'Completion Timeline',
        iconType: 'goals:completionTimeline',
        defaultState: {},
        selectionRequirements: {},
        Chart: GoalCompletionTimelineChart,
        Controls: EmptyControls,
    },
    {
        id: 'timeDistribution',
        category: 'goals',
        name: 'Time Spent Per Goal',
        iconType: 'goals:timeDistribution',
        defaultState: { durationMode: 'activity', focusGoalId: null, grain: 'auto' },
        selectionRequirements: {},
        Chart: GoalTimeDistributionChart,
        Controls: GoalTimeDistributionControls,
    },
    {
        id: 'completionRateByLevel',
        category: 'goals',
        name: 'Completion Rate',
        iconType: 'goals:completionRateByLevel',
        defaultState: {},
        selectionRequirements: {},
        Chart: GoalCompletionRateByLevelChart,
        Controls: EmptyControls,
    },
    {
        id: 'goalAging',
        category: 'goals',
        name: 'Goal Aging',
        iconType: 'goals:goalAging',
        defaultState: {},
        selectionRequirements: {},
        Chart: GoalAgingVisualizationChart,
        Controls: EmptyControls,
    },
    {
        id: 'goalMomentum',
        category: 'goals',
        name: 'Goal Momentum',
        iconType: 'goals:goalMomentum',
        defaultState: {},
        selectionRequirements: {},
        Chart: GoalMomentumVisualizationChart,
        Controls: EmptyControls,
    },
    {
        id: 'staleGoals',
        category: 'goals',
        name: 'Stale Goals',
        iconType: 'goals:staleGoals',
        defaultState: {},
        selectionRequirements: {},
        Chart: StaleGoalsVisualizationChart,
        Controls: EmptyControls,
    },
];
