import React, { Suspense, lazy, useMemo, useState } from 'react';

import SidePaneHeader from '../common/SidePaneHeader';
import SidePaneHeaderButton from '../common/SidePaneHeaderButton';
import ActivityFilterModal from '../common/ActivityFilterModal';
import DateRangeFilter from '../common/DateRangeFilter';
import GoalHierarchySelectionModal from '../goals/GoalHierarchySelectionModal';
import AnalyticsFilterTray from './AnalyticsFilterTray';
import AnalyticsFilterHeader from './AnalyticsFilterHeader';
import { dateRangeSummary, selectionSummary } from './analyticsFilterSummaries';
import { hasActiveGlobalFilters, normalizeGlobalFilters } from './analyticsGlobalFilters';
import { getVisualization } from './visualizations/registry';
import { resolveAnalyticsChartScope } from './analyticsChartScope';
import useAnalyticsFilterPane from './useAnalyticsFilterPane';
import useAnalyticsChartControls from './useAnalyticsChartControls';
import AnalyticsChartSelectionModals from './AnalyticsChartSelectionModals';
import ChartTitleEditor from './ChartTitleEditor';
import GroupByControl from './visualizations/shared/GroupByControl';
import {
    getVisualizationStateUpdate,
    normalizeVisualizationState,
} from './visualizations/state';
import '../sessions/SessionsQuerySidebar.css';

// Loaded with the sidebar's content rather than the route, to keep the Analytics bundle in budget.
const AnalyticsScopeFilters = lazy(() => import('./AnalyticsScopeFilters'));

const SIDEBAR_DATE_RANGE_CLASSES = {
    chipGroup: 'sessions-query-chip-group',
    chip: 'sessions-query-chip',
    chipActive: 'active',
    dateGrid: 'sessions-query-date-grid',
    field: 'sessions-query-field',
};

function AnalyticsScopePane({
    embedded = false,
    scopeKind = 'single',
    inheritedFilters = null,
    rootId,
    sessions = [],
    filters,
    dateRange,
    goals = [],
    activities = [],
    activityGroups = [],
    activityInstances = {},
    selectedWindowState = null,
    // The selected chart's number, matching its pane header.
    chartNumber = null,
    // The bucket grain the selected chart drew, for its Bucket size control.
    shownGrain = null,
    // Every panel's state, so scope filters only show for charts they affect.
    windowStates = null,
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
    const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(scopeKind === 'global');
    const [isSelectedPanelCollapsed, setIsSelectedPanelCollapsed] = useState(false);
    const normalized = useMemo(() => normalizeGlobalFilters(filters), [filters]);
    const resolvedGlobalScope = useMemo(() => resolveAnalyticsChartScope({
        globalFilters: inheritedFilters, localFilters: normalized,
        goalAnalytics: { goals },
        activities,
        activityGroups,
        activityInstances,
    }), [normalized, inheritedFilters, goals, activities, activityGroups, activityInstances]);
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

    const chartContext = useAnalyticsChartControls({ rootId, selectedWindowState, selectedVisualizationMeta,
        visualizationState, profileActivities, profileGoals, resolvedGlobalScope, activityInstances, updateSelectedWindow, updateVisualizationState });
    const { selectedPanelUsesScopedChoices, hasScopedChoices } = chartContext;
    const SelectedControls = selectedVisualizationMeta?.Controls || null;

    const {
        active, isVisible: scopeVisible, optionalFilters, notAppliedTo, toggleShownFilter, removeFilter,
    } = useAnalyticsFilterPane({
        scopeKind,
        selectedWindowState, selectedVisualizationMeta, windowStates, visualizationState, normalized, dateRange,
        updateVisualizationState, updateFilters, onDateRangeChange,
    });
    const isVisible = (id) => id === 'timeRange' && scopeKind === 'chart' ? false : scopeVisible(id);
    const groupDimensions = selectedVisualizationMeta?.groupByDimensions || [];

    const chartSection = (
        <div className="sessions-query-section-group">
            <div className="sessions-query-section-group-title-row">
                <div className="sessions-query-section-group-title">Chart</div>
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
                    {/* Under a chart tab the tab carries the number. */}
                    <ChartTitleEditor number={scopeKind === 'chart' ? null : chartNumber} windowState={selectedWindowState}
                        onRename={(chartTitle) => updateSelectedWindow({ chartTitle })} />
                    {selectedPanelUsesScopedChoices && hasScopedChoices && (
                        <div>Choices follow this chart’s scope.</div>
                    )}
                </div>
            )}

            {SelectedControls && (
                <SelectedControls
                    context={{ ...chartContext, shownGrain, hideGroupBy: true,
                        onOpenActivityModal: () => setIsProfileActivityModalOpen(true),
                        onOpenGoalModal: () => setIsProfileGoalModalOpen(true),
                    }}
                />
            )}
            </section>
            )}
        </div>
    );

    return (
        <div className="sessions-query-sidebar">
            {!embedded && <SidePaneHeader
                title="Filters"
                subtitle={`${active.length} active`}
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
            />}

            <div className="sessions-query-sidebar-content">

                <div className="sessions-query-section-group">
                    <div className="sessions-query-section-group-title-row">
                        <div className="sessions-query-section-group-title">{scopeKind === 'global' ? 'Global filters' : 'Filters'}</div>
                        <button
                            type="button"
                            className="sessions-query-section-toggle"
                            onClick={() => setIsFiltersCollapsed((collapsed) => !collapsed)}
                            aria-expanded={!isFiltersCollapsed}
                        >
                            {isFiltersCollapsed ? 'Show' : 'Hide'}
                        </button>
                    </div>

                    {!isFiltersCollapsed && (
                    <>
                    {isVisible('timeRange') && (
                        <section className="sessions-query-sidebar-section sessions-query-sidebar-section-compact" data-filter-section="timeRange">
                            <AnalyticsFilterHeader title="Time Range" summary={dateRangeSummary(dateRange)}
                                active={active.includes('timeRange')} onClear={() => removeFilter('timeRange')} />
                            <DateRangeFilter
                                value={dateRange}
                                onChange={(range) => onDateRangeChange?.(range)}
                                classNames={SIDEBAR_DATE_RANGE_CLASSES}
                            />
                        </section>
                    )}

                    {isVisible('goals') && (
                        <section className="sessions-query-sidebar-section sessions-query-sidebar-section-compact" data-filter-section="goals">
                            <AnalyticsFilterHeader title="Goals"
                                summary={selectionSummary(normalized.goals.goalIds, goals, 'All goals', 'Unavailable goal')}
                                active={active.includes('goals')} onClear={() => removeFilter('goals')} ignoredBy={notAppliedTo('goals')} />
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
                        </section>
                    )}

                    {isVisible('activities') && (
                        <section className="sessions-query-sidebar-section sessions-query-sidebar-section-compact" data-filter-section="activities">
                            <AnalyticsFilterHeader title="Activities"
                                summary={selectionSummary([...normalized.activities.activityIds, ...normalized.activities.groupIds],
                                    [...activities, ...activityGroups.map((group) => ({ ...group, name: `${group.name} group` }))], 'All activities', 'Unavailable activity')}
                                active={active.includes('activities')} onClear={() => removeFilter('activities')} ignoredBy={notAppliedTo('activities')} />
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
                        </section>
                    )}
                    {(isVisible('tags') || isVisible('templates') || isVisible('programDays')) && (
                        <Suspense fallback={null}>
                            <AnalyticsScopeFilters
                                rootId={rootId}
                                filters={normalized}
                                sessions={sessions}
                                onUpdate={updateFilters}
                                onClearFilter={removeFilter} notAppliedTo={notAppliedTo}
                                visible={{ tags: isVisible('tags'), templates: isVisible('templates'), programDays: isVisible('programDays') }}
                            />
                        </Suspense>
                    )}
                    <AnalyticsFilterTray
                        optionalFilters={optionalFilters}
                        isVisible={isVisible}
                        active={active}
                        onToggle={toggleShownFilter}
                    />
                    </>
                    )}
                </div>
                {scopeKind !== 'global' && selectedWindowState ? chartSection : null}

                {/* A chart with a fixed grouping has nothing to choose, so it gets no Group by section. */}
                {scopeKind !== 'global' && selectedWindowState?.selectedVisualization && groupDimensions.length > 0 && (
                    <section className="sessions-query-section-group" aria-label="Group by">
                        <h4 className="sessions-query-section-group-title">Group by</h4>
                        {visualizationState.runningTotal
                            ? <p className="sessions-query-empty">Running totals use one series.</p>
                            : <GroupByControl context={chartContext} dimensions={groupDimensions} />}
                    </section>
                )}
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

            <AnalyticsChartSelectionModals
                activityOpen={isProfileActivityModalOpen} goalOpen={isProfileGoalModalOpen}
                onCloseActivity={() => setIsProfileActivityModalOpen(false)} onCloseGoal={() => setIsProfileGoalModalOpen(false)}
                activityGroups={activityGroups} context={chartContext}
            />
        </div>
    );
}

export default AnalyticsScopePane;
