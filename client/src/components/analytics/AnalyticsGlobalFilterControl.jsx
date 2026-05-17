import React, { useMemo, useState } from 'react';

import Button from '../atoms/Button';
import ActivityFilterModal from '../common/ActivityFilterModal';
import GoalHierarchySelectionModal from '../goals/GoalHierarchySelectionModal';
import { normalizeGlobalFilters } from './analyticsGlobalFilters';
import styles from './AnalyticsGlobalFilterControl.module.css';

function AnalyticsGlobalFilterControl({
    filters,
    onChange,
    goals = [],
    activities = [],
    activityGroups = [],
    buttonLabel = 'Add Global Filter',
}) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [activeModal, setActiveModal] = useState(null);
    const normalized = useMemo(() => normalizeGlobalFilters(filters), [filters]);

    const goalNames = normalized.goals.goalIds
        .map((goalId) => goals.find((goal) => goal.id === goalId)?.name)
        .filter(Boolean);
    const activityNames = normalized.activities.activityIds
        .map((activityId) => activities.find((activity) => activity.id === activityId)?.name)
        .filter(Boolean);
    const groupNames = normalized.activities.groupIds
        .map((groupId) => activityGroups.find((group) => group.id === groupId)?.name)
        .filter(Boolean);

    const updateFilters = (updater) => {
        onChange?.(updater(normalized));
    };

    const hasGoalFilter = normalized.goals.goalIds.length > 0;
    const hasActivityFilter = normalized.activities.activityIds.length > 0 || normalized.activities.groupIds.length > 0;

    return (
        <div className={styles.globalFilters}>
            <div className={styles.filterRow}>
                <div className={styles.addWrapper}>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsMenuOpen((current) => !current)}
                    >
                        {buttonLabel}
                    </Button>
                    {isMenuOpen && (
                        <div className={styles.addMenu}>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    setActiveModal('goals');
                                }}
                            >
                                <strong>By Goals</strong>
                                <span>Limit all panels to selected goals.</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    setActiveModal('activities');
                                }}
                            >
                                <strong>By Activities</strong>
                                <span>Limit all panels by activities or groups.</span>
                            </button>
                        </div>
                    )}
                </div>

                {hasGoalFilter && (
                    <span className={styles.filterChip}>
                        Goal lineage: {goalNames.length ? goalNames.join(', ') : `${normalized.goals.goalIds.length} selected`}
                        <button
                            type="button"
                            onClick={() => updateFilters((current) => ({
                                ...current,
                                goals: { ...current.goals, goalIds: [] },
                            }))}
                            aria-label="Remove goal lineage filter"
                        >
                            x
                        </button>
                    </span>
                )}

                {hasActivityFilter && (
                    <span className={styles.filterChip}>
                        Activities: {[...activityNames, ...groupNames.map((name) => `${name} group`)].join(', ') || 'Selected'}
                        <button
                            type="button"
                            onClick={() => updateFilters((current) => ({
                                ...current,
                                activities: { activityIds: [], groupIds: [] },
                            }))}
                            aria-label="Remove activity filter"
                        >
                            x
                        </button>
                    </span>
                )}
            </div>

            {hasGoalFilter && (
                <div className={styles.optionRow}>
                    <label>
                        <input
                            type="checkbox"
                            checked={normalized.goals.includeDescendants}
                            onChange={(event) => updateFilters((current) => ({
                                ...current,
                                goals: { ...current.goals, includeDescendants: event.target.checked },
                            }))}
                        />
                        Descendants
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={normalized.goals.includeInheritedActivities}
                            onChange={(event) => updateFilters((current) => ({
                                ...current,
                                goals: { ...current.goals, includeInheritedActivities: event.target.checked },
                            }))}
                        />
                        Inherited activities
                    </label>
                </div>
            )}

            <GoalHierarchySelectionModal
                isOpen={activeModal === 'goals'}
                title="Filter by Goal"
                goals={goals}
                selectedGoalIds={normalized.goals.goalIds}
                selectionMode="multiple"
                confirmLabel="Apply goal filter"
                onClose={() => setActiveModal(null)}
                onConfirm={(goalIds) => updateFilters((current) => ({
                    ...current,
                    goals: { ...current.goals, goalIds },
                }))}
            />

            {activeModal === 'activities' && (
                <ActivityFilterModal
                    title="Filter by Activity"
                    activities={activities}
                    activityGroups={activityGroups}
                    initialActivityIds={normalized.activities.activityIds}
                    initialGroupIds={normalized.activities.groupIds}
                    selectionMode="multiple"
                    allowGroupSelection
                    confirmLabel="Apply activity filter"
                    onConfirm={(activityIds, groupIds) => updateFilters((current) => ({
                        ...current,
                        activities: { activityIds, groupIds },
                    }))}
                    onClose={() => setActiveModal(null)}
                />
            )}
        </div>
    );
}

export default AnalyticsGlobalFilterControl;
