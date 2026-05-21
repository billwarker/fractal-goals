import React, { useMemo, useState } from 'react';

import SidePaneHeader from '../common/SidePaneHeader';
import SidePaneHeaderButton from '../common/SidePaneHeaderButton';
import ActivityFilterModal from '../common/ActivityFilterModal';
import GoalHierarchySelectionModal from '../goals/GoalHierarchySelectionModal';
import { hasActiveGlobalFilters, normalizeGlobalFilters, resolveAnalyticsGlobalFilters } from './analyticsGlobalFilters';
import { getVisualization } from './visualizations/registry';
import {
    getVisualizationStateUpdate,
    normalizeVisualizationState,
} from './visualizations/state';
import '../sessions/SessionsQuerySidebar.css';

const DATE_PRESET_OPTIONS = [
    { value: '7d', label: '7D', days: 7 },
    { value: '30d', label: '30D', days: 30 },
    { value: '90d', label: '90D', days: 90 },
    { value: '6m', label: '6M', days: 182 },
    { value: '1y', label: '1Y', days: 365 },
    { value: 'all', label: 'All', days: null },
    { value: 'custom', label: 'Custom', days: null },
];

function toISODate(date) {
    return date.toISOString().split('T')[0];
}

function getMatchingPreset(dateRange) {
    if (!dateRange?.start && !dateRange?.end) {
        return 'all';
    }
    if (!dateRange?.start || !dateRange?.end) {
        return 'custom';
    }

    const today = toISODate(new Date());
    if (dateRange.end !== today) {
        return 'custom';
    }

    for (const preset of DATE_PRESET_OPTIONS) {
        if (!preset.days) continue;
        const presetStart = new Date();
        presetStart.setDate(presetStart.getDate() - preset.days);
        if (dateRange.start === toISODate(presetStart)) {
            return preset.value;
        }
    }

    return 'custom';
}

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
    const derivedPreset = useMemo(() => getMatchingPreset(dateRange), [dateRange]);
    const [isCustomPresetSelected, setIsCustomPresetSelected] = useState(derivedPreset === 'custom');
    const selectedPreset = (!dateRange?.start && !dateRange?.end)
        ? 'all'
        : isCustomPresetSelected ? 'custom' : derivedPreset;
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
    const selectedActivityDef = selectedActivity
        ? profileActivities.find((activity) => activity.id === selectedActivity.id)
        : null;
    const selectedGoal = selectedWindowState?.selectedGoal || null;
    const selectedGoalDef = selectedGoal
        ? profileGoals.find((goal) => goal.id === selectedGoal.id)
        : null;
    const selectedVisualizationLabel = [
        selectedWindowState?.selectedCategory,
        selectedWindowState?.selectedVisualization,
    ].filter(Boolean).join(' / ');
    const metricDefinitions = selectedActivityDef?.metric_definitions || [];
    const multiplicativeMetrics = metricDefinitions.filter((metric) => metric.is_multiplicative !== false);
    const metricOptions = [
        ...metricDefinitions,
        ...(selectedActivityDef?.metrics_multiplicative && multiplicativeMetrics.length > 1
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

    const handlePresetClick = (preset) => {
        setIsCustomPresetSelected(preset.value === 'custom');
        if (preset.value === 'all') {
            onDateRangeChange?.({ start: null, end: null });
            return;
        }

        if (preset.value === 'custom') {
            if (!dateRange?.start && !dateRange?.end) {
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - 30);
                onDateRangeChange?.({ start: toISODate(start), end: toISODate(end) });
            }
            return;
        }

        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - preset.days);
        onDateRangeChange?.({ start: toISODate(start), end: toISODate(end) });
    };

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
                        <div className="sessions-query-chip-group">
                            {DATE_PRESET_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={`sessions-query-chip ${selectedPreset === option.value ? 'active' : ''}`}
                                    onClick={() => handlePresetClick(option)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>

                        {selectedPreset === 'custom' && (
                            <div className="sessions-query-date-grid">
                                <label className="sessions-query-field">
                                    <span>Start</span>
                                    <input
                                        type="date"
                                        value={dateRange?.start || ''}
                                        onChange={(event) => onDateRangeChange?.({
                                            ...dateRange,
                                            start: event.target.value || null,
                                        })}
                                    />
                                </label>
                                <label className="sessions-query-field">
                                    <span>End</span>
                                    <input
                                        type="date"
                                        value={dateRange?.end || ''}
                                        onChange={(event) => onDateRangeChange?.({
                                            ...dateRange,
                                            end: event.target.value || null,
                                        })}
                                    />
                                </label>
                            </div>
                        )}
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
