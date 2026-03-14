import React, { useMemo, useState } from 'react';
import SessionCalendarHeatmap from './SessionCalendarHeatmap';
import SessionFilterSelectionModal from './SessionFilterSelectionModal';
import './SessionsQuerySidebar.css';

const RANGE_PRESET_OPTIONS = [
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' },
    { value: '90d', label: '90D' },
    { value: '6m', label: '6M' },
    { value: '1y', label: '1Y' },
    { value: 'all', label: 'All' },
    { value: 'custom', label: 'Custom' },
];

function SessionsQuerySidebar({
    filters,
    visibleSessionsCount = 0,
    totalSessionsCount = 0,
    activities = [],
    activityGroups = [],
    goalOptions = [],
    heatmap,
    isHeatmapLoading = false,
    hasActiveFilters = false,
    onUpdateFilters,
    onResetFilters,
    onToggleCollapse,
    isMobile = false,
}) {
    const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
    const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
    const selectedActivityNames = useMemo(
        () => activities
            .filter((activity) => filters.activityIds.includes(activity.id))
            .map((activity) => activity.name),
        [activities, filters.activityIds]
    );
    const selectedGoalNames = useMemo(
        () => goalOptions
            .filter((goal) => filters.goalIds.includes(goal.id))
            .map((goal) => goal.name),
        [goalOptions, filters.goalIds]
    );

    return (
        <div className="sessions-query-sidebar">
            <div className="sessions-query-sidebar-header">
                <div>
                    <h3 className="sessions-query-sidebar-title">Filters</h3>
                    <div className="sessions-query-sidebar-subtitle">
                        {visibleSessionsCount} shown
                        {totalSessionsCount ? ` of ${totalSessionsCount}` : ''}
                    </div>
                </div>
                <div className="sessions-query-sidebar-header-actions">
                    <button
                        type="button"
                        className="sessions-query-sidebar-reset"
                        onClick={() => onResetFilters?.()}
                        disabled={!hasActiveFilters}
                    >
                        Reset Filters
                    </button>
                    {onToggleCollapse && (
                        <button
                            type="button"
                            className="sessions-query-sidebar-collapse"
                            onClick={onToggleCollapse}
                            aria-label="Collapse filters panel"
                        >
                            {isMobile ? 'Hide' : 'Collapse'}
                        </button>
                    )}
                </div>
            </div>

            <div className="sessions-query-sidebar-content">
                <section className="sessions-query-sidebar-section">
                    <div className="sessions-query-sidebar-section-header">
                        <h4>Session Heatmap</h4>
                        <label className="sessions-query-checkbox-row sessions-query-checkbox-row-compact">
                            <input
                                type="checkbox"
                                checked={filters.heatmapMode === 'duration'}
                                onChange={(event) => onUpdateFilters?.({
                                    heatmapMode: event.target.checked ? 'duration' : 'count',
                                })}
                            />
                            <span>Heat by Session Duration</span>
                        </label>
                    </div>
                    <SessionCalendarHeatmap
                        heatmap={heatmap}
                        isLoading={isHeatmapLoading}
                    />
                </section>

                <section className="sessions-query-sidebar-section">
                    <div className="sessions-query-sidebar-section-header">
                        <h4>Time Range</h4>
                    </div>
                    <div className="sessions-query-chip-group">
                        {RANGE_PRESET_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className={`sessions-query-chip ${filters.rangePreset === option.value ? 'active' : ''}`}
                                onClick={() => onUpdateFilters?.({ rangePreset: option.value })}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {filters.rangePreset === 'custom' && (
                        <div className="sessions-query-date-grid">
                            <label className="sessions-query-field">
                                <span>Start</span>
                                <input
                                    type="date"
                                    value={filters.rangeStart}
                                    onChange={(event) => onUpdateFilters?.({ rangeStart: event.target.value })}
                                />
                            </label>
                            <label className="sessions-query-field">
                                <span>End</span>
                                <input
                                    type="date"
                                    value={filters.rangeEnd}
                                    onChange={(event) => onUpdateFilters?.({ rangeEnd: event.target.value })}
                                />
                            </label>
                        </div>
                    )}
                </section>

                <section className="sessions-query-sidebar-section">
                    <div className="sessions-query-sidebar-section-header">
                        <h4>Session Duration</h4>
                    </div>
                    <div className="sessions-query-duration-row">
                        <button
                            type="button"
                            className="sessions-query-duration-operator"
                            onClick={() => onUpdateFilters?.({
                                durationOperator: filters.durationOperator === 'gt' ? 'lt' : 'gt',
                            })}
                            aria-label={`Duration operator: ${filters.durationOperator === 'gt' ? 'greater than' : 'less than'}. Click to toggle.`}
                            title="Toggle greater/less than"
                        >
                            <span className="sessions-query-duration-operator-label">
                                {filters.durationOperator === 'gt' ? 'Greater' : 'Less'}
                            </span>
                        </button>
                        <span className="sessions-query-duration-text">than</span>
                        <label className="sessions-query-duration-field">
                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={filters.durationMinutes}
                                onChange={(event) => onUpdateFilters?.({ durationMinutes: event.target.value })}
                                placeholder="Any"
                            />
                            <span className="sessions-query-duration-unit">minutes</span>
                        </label>
                        <button
                            type="button"
                            className="sessions-query-clear-inline"
                            onClick={() => onUpdateFilters?.({ durationMinutes: '' })}
                            disabled={!filters.durationMinutes}
                        >
                            Clear
                        </button>
                    </div>
                </section>

                <section className="sessions-query-sidebar-section">
                    <div className="sessions-query-sidebar-section-header">
                        <h4>Completion</h4>
                    </div>
                    <div className="sessions-query-chip-group">
                        {[
                            { value: 'all', label: 'All' },
                            { value: 'incomplete', label: 'Incomplete' },
                            { value: 'completed', label: 'Completed' },
                        ].map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className={`sessions-query-chip ${filters.completed === option.value ? 'active' : ''}`}
                                onClick={() => onUpdateFilters?.({ completed: option.value })}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </section>

                <section className="sessions-query-sidebar-section">
                    <div className="sessions-query-sidebar-section-header">
                        <h4>Sort</h4>
                    </div>
                    <div className="sessions-query-inline-actions">
                        <button
                            type="button"
                            className={`sessions-query-chip ${filters.sortBy === 'session_start' ? 'active' : ''}`}
                            onClick={() => onUpdateFilters?.({ sortBy: 'session_start' })}
                        >
                            Session Date
                        </button>
                        <button
                            type="button"
                            className={`sessions-query-chip ${filters.sortBy === 'updated_at' ? 'active' : ''}`}
                            onClick={() => onUpdateFilters?.({ sortBy: 'updated_at' })}
                        >
                            Last Modified
                        </button>
                    </div>
                    <div className="sessions-query-inline-actions">
                        <button
                            type="button"
                            className={`sessions-query-chip ${filters.sortOrder === 'desc' ? 'active' : ''}`}
                            onClick={() => onUpdateFilters?.({ sortOrder: 'desc' })}
                        >
                            Newest First
                        </button>
                        <button
                            type="button"
                            className={`sessions-query-chip ${filters.sortOrder === 'asc' ? 'active' : ''}`}
                            onClick={() => onUpdateFilters?.({ sortOrder: 'asc' })}
                        >
                            Oldest First
                        </button>
                    </div>
                </section>

                <section className="sessions-query-sidebar-section">
                    <div className="sessions-query-sidebar-section-header">
                        <h4>Activities</h4>
                        <span>{filters.activityIds.length} selected</span>
                    </div>
                    <button
                        type="button"
                        className="sessions-query-picker-button"
                        onClick={() => setIsActivityModalOpen(true)}
                        disabled={activities.length === 0}
                    >
                        {filters.activityIds.length > 0
                            ? `Choose Activities (${filters.activityIds.length})`
                            : 'Choose Activities'}
                    </button>
                    <div className="sessions-query-selection-preview">
                        {selectedActivityNames.length > 0
                            ? selectedActivityNames.join(', ')
                            : 'All activities'}
                    </div>
                </section>

                <section className="sessions-query-sidebar-section">
                    <div className="sessions-query-sidebar-section-header">
                        <h4>Goals Via Activity</h4>
                        <span>{filters.goalIds.length} selected</span>
                    </div>
                    <button
                        type="button"
                        className="sessions-query-picker-button"
                        onClick={() => setIsGoalModalOpen(true)}
                        disabled={goalOptions.length === 0}
                    >
                        {filters.goalIds.length > 0
                            ? `Choose Goals (${filters.goalIds.length})`
                            : 'Choose Goals'}
                    </button>
                    <div className="sessions-query-selection-preview">
                        {selectedGoalNames.length > 0
                            ? selectedGoalNames.join(', ')
                            : 'All activity-linked goals'}
                    </div>
                </section>

                <section className="sessions-query-sidebar-section">
                    <div className="sessions-query-sidebar-section-header">
                        <h4>Summary</h4>
                    </div>
                    <div className="sessions-query-summary">
                        <div>
                            Range: {filters.rangePreset === 'custom'
                                ? `${filters.rangeStart || '-'} to ${filters.rangeEnd || '-'}`
                                : RANGE_PRESET_OPTIONS.find((option) => option.value === filters.rangePreset)?.label || '90D'}
                        </div>
                        <div>
                            Heat: {filters.heatmapMode === 'duration' ? 'Session duration' : 'Session count'}
                        </div>
                    <div>
                        Duration: {filters.durationMinutes
                            ? `${filters.durationOperator === 'gt' ? '>' : '<'} ${filters.durationMinutes} min`
                            : 'Any'}
                        </div>
                        <div>Activities: {selectedActivityNames.length ? selectedActivityNames.join(', ') : 'All'}</div>
                        <div>Goals: {selectedGoalNames.length ? selectedGoalNames.join(', ') : 'All'}</div>
                    </div>
                </section>
            </div>

            <SessionFilterSelectionModal
                isOpen={isActivityModalOpen}
                title="Filter By Activity"
                items={activities}
                activityGroups={activityGroups}
                selectedIds={filters.activityIds}
                searchPlaceholder="Search activities"
                emptyState="No activities available."
                itemKind="activity"
                onClose={() => setIsActivityModalOpen(false)}
                onConfirm={(selectedIds) => onUpdateFilters?.({ activityIds: selectedIds })}
            />

            <SessionFilterSelectionModal
                isOpen={isGoalModalOpen}
                title="Filter By Goal"
                items={goalOptions}
                selectedIds={filters.goalIds}
                searchPlaceholder="Search goals"
                emptyState="No activity-linked goals available."
                itemKind="goal"
                onClose={() => setIsGoalModalOpen(false)}
                onConfirm={(selectedIds) => onUpdateFilters?.({ goalIds: selectedIds })}
            />
        </div>
    );
}

export default SessionsQuerySidebar;
