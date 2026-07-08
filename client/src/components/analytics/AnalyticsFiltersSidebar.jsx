import React, { useMemo, useState } from 'react';

import SidePaneHeader from '../common/SidePaneHeader';
import SidePaneHeaderButton from '../common/SidePaneHeaderButton';
import ActivityFilterModal from '../common/ActivityFilterModal';
import DateRangeFilter from '../common/DateRangeFilter';
import GoalHierarchySelectionModal from '../goals/GoalHierarchySelectionModal';
import { hasActiveGlobalFilters, normalizeGlobalFilters, resolveAnalyticsGlobalFilters } from './analyticsGlobalFilters';
import { getVisualization } from './visualizations/registry';
import {
    getVisualizationStateUpdate,
    normalizeVisualizationState,
} from './visualizations/state';
import '../sessions/SessionsQuerySidebar.css';

const SIDEBAR_DATE_RANGE_CLASSES = {
    chipGroup: 'sessions-query-chip-group',
    chip: 'sessions-query-chip',
    chipActive: 'active',
    dateGrid: 'sessions-query-date-grid',
    field: 'sessions-query-field',
};

function AnalyticsFiltersSidebar({
    filters,
    dateRange,
    goals = [],
    activities = [],
    activityGroups = [],
    activityInstances = {},
    selectedWindowState = null,
    onUpdateSelectedWindowState,
    onChange,
    onDateRangeChange,
    onReset,
    onToggleCollapse,
    isMobile = false,
}) {
    const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
    const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
    const [isProfileActivityModalOpen, setIsProfileActivityModalOpen] = useState(false);
    const [isProfileGoalModalOpen, setIsProfileGoalModalOpen] = useState(false);
    const [isGlobalScopeCollapsed, setIsGlobalScopeCollapsed] = useState(false);
    const [isSelectedPanelCollapsed, setIsSelectedPanelCollapsed] = useState(false);
    const normalized = useMemo(() => normalizeGlobalFilters(filters), [filters]);
    const activeFilterCount = [
        Boolean(dateRange?.start || dateRange?.end),
        normalized.goals.goalIds.length > 0,
        normalized.activities.activityIds.length > 0 || normalized.activities.groupIds.length > 0,
    ].filter(Boolean).length;

    const selectedGoalNames = useMemo(
        () => goals
            .filter((goal) => normalized.goals.goalIds.includes(goal.id))
            .map((goal) => goal.name),
        [goals, normalized.goals.goalIds]
    );
    const selectedActivityNames = useMemo(
        () => activities
            .filter((activity) => normalized.activities.activityIds.includes(activity.id))
            .map((activity) => activity.name),
        [activities, normalized.activities.activityIds]
    );
    const selectedGroupNames = useMemo(
        () => activityGroups
            .filter((group) => normalized.activities.groupIds.includes(group.id))
            .map((group) => `${group.name} group`),
        [activityGroups, normalized.activities.groupIds]
    );
    const resolvedGlobalScope = useMemo(() => resolveAnalyticsGlobalFilters({
        filters: normalized,
        goalAnalytics: { goals },
        activities,
        activityGroups,
        activityInstances,
    }), [normalized, goals, activities, activityGroups, activityInstances]);
    const profileActivities = useMemo(() => (
        resolvedGlobalScope.hasActivityFilter
            ? activities.filter((activity) => resolvedGlobalScope.activityIds?.has(activity.id))
            : activities
    ), [activities, resolvedGlobalScope]);
    const profileGoals = useMemo(() => (
        resolvedGlobalScope.hasGoalFilter
            ? goals.filter((goal) => resolvedGlobalScope.goalIds.has(goal.id))
            : goals
    ), [goals, resolvedGlobalScope]);

    const updateFilters = (updater) => {
        onChange?.(updater(normalized));
    };
    const updateSelectedWindow = (updates) => {
        onUpdateSelectedWindowState?.(updates);
    };
    const selectedVisualizationMeta = getVisualization(
        selectedWindowState?.selectedCategory,
        selectedWindowState?.selectedVisualization
    );
    const visualizationState = useMemo(
        () => normalizeVisualizationState(selectedWindowState || {}),
        [selectedWindowState]
    );
    const updateVisualizationState = (updates) => {
        updateSelectedWindow(getVisualizationStateUpdate(selectedWindowState || {}, updates));
    };

    const selectedActivity = selectedWindowState?.selectedActivity || null;
    const selectedActivityDef = useMemo(() => {
        if (selectedActivity?.id) {
            return profileActivities.find((activity) => activity.id === selectedActivity.id) || null;
        }
        if (
            selectedVisualizationMeta?.selectionRequirements?.activity
            && resolvedGlobalScope.hasActivityFilter
            && profileActivities.length === 1
        ) {
            return profileActivities[0];
        }
        return null;
    }, [profileActivities, resolvedGlobalScope.hasActivityFilter, selectedActivity, selectedVisualizationMeta]);
    const selectedGoal = selectedWindowState?.selectedGoal || null;
    const selectedGoalDef = useMemo(() => {
        if (selectedGoal?.id) {
            return profileGoals.find((goal) => goal.id === selectedGoal.id) || null;
        }
        if (resolvedGlobalScope.filters.goals.goalIds.length === 1) {
            const goalId = resolvedGlobalScope.filters.goals.goalIds[0];
            return profileGoals.find((goal) => goal.id === goalId) || null;
        }
        if (
            selectedVisualizationMeta?.selectionRequirements?.goal
            && (resolvedGlobalScope.hasGoalFilter || resolvedGlobalScope.hasActivityFilter)
            && profileGoals.length === 1
        ) {
            return profileGoals[0];
        }
        return null;
    }, [
        profileGoals,
        resolvedGlobalScope.filters.goals.goalIds,
        resolvedGlobalScope.hasActivityFilter,
        resolvedGlobalScope.hasGoalFilter,
        selectedGoal,
        selectedVisualizationMeta,
    ]);
    const selectedVisualizationLabel = [
        selectedWindowState?.selectedCategory,
        selectedWindowState?.selectedVisualization,
    ].filter(Boolean).join(' / ');
    const metricDefinitions = selectedActivityDef?.metric_definitions || [];
    const multiplicativeMetrics = metricDefinitions.filter((metric) => metric.is_multiplicative !== false);
    const metricOptions = [
        ...metricDefinitions,
        ...(multiplicativeMetrics.length > 1
            ? [{ id: '__product__', name: multiplicativeMetrics.map((metric) => metric.name).join(' x '), unit: 'Product' }]
            : []),
    ];
    const selectedMetricId = visualizationState?.metric?.id || visualizationState?.metric || metricOptions[0]?.id || '';
    const selectedMetricY2Id = visualizationState?.metricY2?.id || visualizationState?.metricY2 || '';
    const selectedMetricXId = visualizationState?.metricX?.id || visualizationState?.metricX || metricDefinitions[0]?.id || '';
    const selectedMetricYId = visualizationState?.metricY?.id || visualizationState?.metricY || metricDefinitions[1]?.id || '';
    const selectedPanelUsesScopedChoices = selectedWindowState?.selectedVisualization
        && (selectedVisualizationMeta?.selectionRequirements?.goal || selectedVisualizationMeta?.selectionRequirements?.activity);
    const hasScopedChoices = resolvedGlobalScope.hasGoalFilter || resolvedGlobalScope.hasActivityFilter;
    const activityInstanceCounts = useMemo(() => Object.fromEntries(
        profileActivities.map((activity) => [activity.id, (activityInstances[activity.id] || []).length])
    ), [profileActivities, activityInstances]);
    const SelectedControls = selectedVisualizationMeta?.Controls || null;

    return (
        <div className="sessions-query-sidebar">
            <SidePaneHeader
                title="Filters"
                subtitle={`${activeFilterCount} active`}
                actions={(
                    <>
                        <SidePaneHeaderButton
                            variant="reset"
                            onClick={() => {
                                onReset?.();
                                onDateRangeChange?.({ start: null, end: null });
                            }}
                            disabled={!hasActiveGlobalFilters(normalized) && !(dateRange?.start || dateRange?.end)}
                        >
                            Reset Filters
                        </SidePaneHeaderButton>
                        {onToggleCollapse && (
                            <SidePaneHeaderButton
                                onClick={onToggleCollapse}
                                aria-label="Collapse filters panel"
                            >
                                {isMobile ? 'Hide' : 'Collapse'}
                            </SidePaneHeaderButton>
                        )}
                    </>
                )}
            />

            <div className="sessions-query-sidebar-content">
                <div className="sessions-query-section-group">
                    <div className="sessions-query-section-group-title-row">
                        <div className="sessions-query-section-group-title">Global Scope</div>
                        <button
                            type="button"
                            className="sessions-query-section-toggle"
                            onClick={() => setIsGlobalScopeCollapsed((collapsed) => !collapsed)}
                            aria-expanded={!isGlobalScopeCollapsed}
                        >
                            {isGlobalScopeCollapsed ? 'Show' : 'Hide'}
                        </button>
                    </div>

                    {!isGlobalScopeCollapsed && (
                    <>
                    <section className="sessions-query-sidebar-section sessions-query-sidebar-section-compact">
                        <div className="sessions-query-sidebar-section-header">
                            <h4>Time Range</h4>
                        </div>
                        <DateRangeFilter
                            value={dateRange}
                            onChange={(range) => onDateRangeChange?.(range)}
                            classNames={SIDEBAR_DATE_RANGE_CLASSES}
                        />
                    </section>

                    <section className="sessions-query-sidebar-section sessions-query-sidebar-section-compact">
                        <div className="sessions-query-sidebar-section-header">
                            <h4>Goals</h4>
                            <span>{normalized.goals.goalIds.length} selected</span>
                        </div>
                        <button
                            type="button"
                            className="sessions-query-picker-button"
                            onClick={() => setIsGoalModalOpen(true)}
                            disabled={goals.length === 0}
                        >
                            {normalized.goals.goalIds.length > 0
                                ? `Choose Goals (${normalized.goals.goalIds.length})`
                                : 'Choose Goals'}
                        </button>
                        <div className="sessions-query-selection-preview">
                            {selectedGoalNames.length > 0 ? selectedGoalNames.join(', ') : 'All goals'}
                        </div>
                    </section>

                    <section className="sessions-query-sidebar-section sessions-query-sidebar-section-compact">
                        <div className="sessions-query-sidebar-section-header">
                            <h4>Activities</h4>
                            <span>{normalized.activities.activityIds.length + normalized.activities.groupIds.length} selected</span>
                        </div>
                        <button
                            type="button"
                            className="sessions-query-picker-button"
                            onClick={() => setIsActivityModalOpen(true)}
                            disabled={activities.length === 0}
                        >
                            {normalized.activities.activityIds.length + normalized.activities.groupIds.length > 0
                                ? `Choose Activities (${normalized.activities.activityIds.length + normalized.activities.groupIds.length})`
                                : 'Choose Activities'}
                        </button>
                        <div className="sessions-query-selection-preview">
                            {[...selectedActivityNames, ...selectedGroupNames].length > 0
                                ? [...selectedActivityNames, ...selectedGroupNames].join(', ')
                                : 'All activities'}
                        </div>
                    </section>
                    </>
                    )}
                </div>

                <div className="sessions-query-section-group">
                    <div className="sessions-query-section-group-title-row">
                        <div className="sessions-query-section-group-title">Selected Panel</div>
                        <button
                            type="button"
                            className="sessions-query-section-toggle"
                            onClick={() => setIsSelectedPanelCollapsed((collapsed) => !collapsed)}
                            aria-expanded={!isSelectedPanelCollapsed}
                        >
                            {isSelectedPanelCollapsed ? 'Show' : 'Hide'}
                        </button>
                    </div>

                    {!isSelectedPanelCollapsed && (
                    <section className="sessions-query-sidebar-section sessions-query-sidebar-section-compact">
                    {!selectedWindowState?.selectedVisualization && (
                        <div className="sessions-query-empty">
                            Select a visualization panel to show its controls.
                        </div>
                    )}

                    {selectedWindowState?.selectedVisualization && (
                        <div className="sessions-query-summary">
                            <div>{selectedVisualizationLabel}</div>
                            {selectedPanelUsesScopedChoices && hasScopedChoices && (
                                <div>Choices follow global scope.</div>
                            )}
                        </div>
                    )}

                    {SelectedControls && (
                        <SelectedControls
                            context={{
                                metricDefinitions,
                                metricOptions,
                                onOpenActivityModal: () => setIsProfileActivityModalOpen(true),
                                onOpenGoalModal: () => setIsProfileGoalModalOpen(true),
                                profileActivities,
                                profileGoals,
                                selectedActivityDef,
                                selectedGoalDef,
                                selectedMetricId,
                                selectedMetricXId,
                                selectedMetricYId,
                                selectedMetricY2Id,
                                selectedWindowState,
                                selectedVisualizationMeta,
                                updateSelectedWindow,
                                updateVisualizationState,
                                visualization: selectedVisualizationMeta,
                                visualizationState,
                            }}
                        />
                    )}
                    </section>
                    )}
                </div>
            </div>

            {isActivityModalOpen && (
                <ActivityFilterModal
                    title="Filter by Activity"
                    activities={activities}
                    activityGroups={activityGroups}
                    initialActivityIds={normalized.activities.activityIds}
                    initialGroupIds={normalized.activities.groupIds}
                    selectionMode="multiple"
                    allowGroupSelection
                    confirmLabel="Apply"
                    onClose={() => setIsActivityModalOpen(false)}
                    onConfirm={(activityIds, groupIds) => updateFilters((current) => ({
                        ...current,
                        activities: { activityIds, groupIds },
                    }))}
                />
            )}

            <GoalHierarchySelectionModal
                isOpen={isGoalModalOpen}
                title="Filter by Goal"
                goals={goals}
                selectedGoalIds={normalized.goals.goalIds}
                selectionMode="multiple"
                searchPlaceholder="Search goals"
                emptyState="No goals available."
                connectorHighlightMode="bulk"
                showGoalHighlightHalo
                onClose={() => setIsGoalModalOpen(false)}
                onConfirm={(goalIds) => updateFilters((current) => ({
                    ...current,
                    goals: { ...current.goals, goalIds },
                }))}
            />

            {isProfileActivityModalOpen && (
                <ActivityFilterModal
                    title="Filter by Activity"
                    activities={profileActivities}
                    activityGroups={activityGroups}
                    initialActivityIds={selectedActivityDef?.id ? [selectedActivityDef.id] : []}
                    initialGroupIds={[]}
                    selectionMode="single"
                    allowGroupSelection={false}
                    activityCounts={activityInstanceCounts}
                    confirmLabel="Select activity"
                    onClose={() => setIsProfileActivityModalOpen(false)}
                    onConfirm={(activityIds) => {
                        const activity = activityIds.length > 0
                            ? profileActivities.find((item) => item.id === activityIds[0]) || null
                            : null;
                        updateSelectedWindow({
                            selectedActivity: activity,
                            ...getVisualizationStateUpdate(selectedWindowState || {}, {
                                selectedSplit: 'all',
                                metricX: null,
                                metricY: null,
                                metric: null,
                                metricY2: null,
                            }),
                        });
                    }}
                />
            )}

            <GoalHierarchySelectionModal
                isOpen={isProfileGoalModalOpen}
                title="Filter by Goal"
                goals={profileGoals}
                selectedGoalIds={selectedGoalDef?.id ? [selectedGoalDef.id] : []}
                selectionMode="single"
                searchPlaceholder="Search goals"
                emptyState="No goals available."
                connectorHighlightMode="bulk"
                showGoalHighlightHalo
                confirmLabel="Select goal"
                onClose={() => setIsProfileGoalModalOpen(false)}
                onConfirm={(goalIds) => {
                    const goal = goalIds.length > 0
                        ? profileGoals.find((item) => item.id === goalIds[0]) || null
                        : null;
                    updateSelectedWindow({ selectedGoal: goal });
                }}
            />
        </div>
    );
}

export default AnalyticsFiltersSidebar;
