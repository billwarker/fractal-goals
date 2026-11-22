import React, { useMemo, useState } from 'react';
import SidePaneHeader from '../common/SidePaneHeader';
import SidePaneHeaderButton from '../common/SidePaneHeaderButton';
import FilterPickerField from '../common/FilterPickerField';
import { ActivityFilterPicker, GoalFilterModal } from '../common/FilterPickerModals';
import { describeSessionRange } from '../../hooks/useSessionsPageFilters';
import { formatLiteralDate } from '../../utils/dateUtils';
import SessionCalendarHeatmap from './SessionCalendarHeatmap';
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

/** "10 of 75 sessions" while the list is still paging in, "75 sessions" once it all shows. */
function sessionCountLabel(visible, total) {
    const noun = (count) => (count === 1 ? 'session' : 'sessions');
    if (!total || visible >= total) return `${visible} ${noun(visible)}`;
    return `${visible} of ${total} ${noun(total)}`;
}

function SessionsQuerySidebar({
    filters,
    visibleSessionsCount = 0,
    totalSessionsCount = 0,
    activities = [],
    activityGroups = [],
    goalOptions = [],
    heatmap,
    isHeatmapLoading = false,
    isActivityFilterLoading = false,
    isGoalFilterLoading = false,
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
            <SidePaneHeader
                title="Filters"
                subtitle={`${sessionCountLabel(visibleSessionsCount, totalSessionsCount)} · ${filters.day ? formatLiteralDate(filters.day) : describeSessionRange(filters)}`}
                actions={(
                    <>
                    <SidePaneHeaderButton
                        variant="reset"
                        onClick={() => onResetFilters?.()}
                        disabled={!hasActiveFilters}
                    >
                        Reset Filters
                    </SidePaneHeaderButton>
                    {onToggleCollapse && (
                        <SidePaneHeaderButton
                            onClick={onToggleCollapse}
                            aria-label={isMobile ? 'Hide filters panel' : 'Collapse filters panel'}
                        >
                            {isMobile ? 'Hide' : 'Collapse'}
                        </SidePaneHeaderButton>
                    )}
                    </>
                )}
            />

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
                    {filters.day && (
                        <div className="sessions-query-selected-day">
                            <span>Showing {formatLiteralDate(filters.day)}</span>
                            <button type="button" onClick={() => onUpdateFilters?.({ day: null })}>
                                Show all days
                            </button>
                        </div>
                    )}
                    <SessionCalendarHeatmap
                        heatmap={heatmap}
                        isLoading={isHeatmapLoading}
                        selectedDay={filters.day}
                        onSelectDay={(day) => onUpdateFilters?.({ day })}
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
                        <h4>Sort</h4>
                    </div>
                    <div className="sessions-query-sort-row">
                        <button
                            type="button"
                            className="sessions-query-sort-toggle"
                            onClick={() => onUpdateFilters?.({
                                sortBy: filters.sortBy === 'session_start' ? 'updated_at' : 'session_start',
                            })}
                            aria-label={`Sort field: ${filters.sortBy === 'session_start' ? 'session date' : 'last modified'}. Click to toggle.`}
                            title="Toggle sort field"
                        >
                            {filters.sortBy === 'session_start' ? 'Session Date' : 'Last Modified'}
                        </button>
                        <span className="sessions-query-sort-text">by</span>
                        <button
                            type="button"
                            className="sessions-query-sort-toggle"
                            onClick={() => onUpdateFilters?.({
                                sortOrder: filters.sortOrder === 'desc' ? 'asc' : 'desc',
                            })}
                            aria-label={`Sort order: ${filters.sortOrder === 'desc' ? 'newest first' : 'oldest first'}. Click to toggle.`}
                            title="Toggle sort order"
                        >
                            {filters.sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
                        </button>
                    </div>
                </section>

                <section className="sessions-query-sidebar-section">
                    <FilterPickerField
                        title="Activities"
                        chooseLabel="Choose Activities"
                        count={filters.activityIds.length}
                        selectedNames={selectedActivityNames}
                        onChoose={() => setIsActivityModalOpen(true)}
                        disabled={isActivityFilterLoading || activities.length === 0}
                    />
                </section>

                <section className="sessions-query-sidebar-section">
                    <FilterPickerField
                        title="Goals Via Activity"
                        chooseLabel="Choose Goals"
                        count={filters.goalIds.length}
                        selectedNames={selectedGoalNames}
                        onChoose={() => setIsGoalModalOpen(true)}
                        disabled={isGoalFilterLoading || goalOptions.length === 0}
                    />
                </section>
            </div>

            {isActivityModalOpen && (
                <ActivityFilterPicker
                    activities={activities}
                    activityGroups={activityGroups}
                    selectedActivityIds={filters.activityIds}
                    onClose={() => setIsActivityModalOpen(false)}
                    onConfirm={(selectedIds) => onUpdateFilters?.({ activityIds: selectedIds })}
                />
            )}

            <GoalFilterModal
                isOpen={isGoalModalOpen}
                goals={goalOptions}
                selectedGoalIds={filters.goalIds}
                onClose={() => setIsGoalModalOpen(false)}
                onConfirm={(selectedIds) => onUpdateFilters?.({ goalIds: selectedIds })}
            />
        </div>
    );
}

export default SessionsQuerySidebar;
