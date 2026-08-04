import React, { useMemo, useState } from 'react';

import { ActivityPicker } from '../activityPicker';
import ViewToggleTabs from './ViewToggleTabs';
import styles from './ActivitySelectorPanel.module.css';


const SELECTOR_VIEWS = [
    { value: 'activities', label: 'Activities' },
    { value: 'circuits', label: 'Activity Circuits' },
];

function getCircuitTypeLabel(circuit) {
    const plannedRounds = Number(circuit.planned_rounds);
    if (!Number.isInteger(plannedRounds) || plannedRounds < 1) return 'Circuit';
    return `Circuit • ${plannedRounds} ${plannedRounds === 1 ? 'round' : 'rounds'}`;
}

function CircuitActivityList({ circuit }) {
    const slots = [...(circuit.slots || [])].sort(
        (first, second) => (first.sort_order || 0) - (second.sort_order || 0)
    );

    if (slots.length === 0) return null;

    return (
        <span
            className={styles.circuitActivityList}
            role="list"
            aria-label={`${circuit.name} activities`}
        >
            {slots.map((slot, index) => {
                const activity = slot.activity || {};
                return (
                    <span
                        key={slot.id || `${slot.activity_definition_id || 'activity'}-${index}`}
                        className={styles.circuitActivityItem}
                        role="listitem"
                    >
                        <span className={styles.circuitActivityName}>
                            {activity.name || slot.activity_name || 'Unavailable activity'}
                        </span>
                        {activity.description && (
                            <span className={styles.circuitActivityDescription}>
                                {activity.description}
                            </span>
                        )}
                    </span>
                );
            })}
        </span>
    );
}

export default function ActivitySelectorPanel({
    activities = [],
    circuits = [],
    activityGroups = [],
    onClose,
    onSelectActivity,
    onSelectCircuit,
    onSelectGroup,
    onCreateActivityDefinition,
    onCopyActivityDefinition,
    canCopyActivity,
    allowCreate = false,
    allowCopy = false,
    allowGroupSelection = false,
    closeOnSelect = false,
    initialBrowseGroupId = null,
    groupSelectionLabel = 'Use Group',
    groupSelectedLabel = 'Selected',
    title = 'Select Activity Group',
    searchPlaceholder = 'Search activities...',
    showTypeToggle = false,
}) {
    const [selectorView, setSelectorView] = useState('activities');
    const selectingCircuits = showTypeToggle && selectorView === 'circuits';
    const circuitOptions = useMemo(() => (circuits || []).map((circuit) => ({
        ...circuit,
        selection_kind: 'circuit',
        type: getCircuitTypeLabel(circuit),
    })), [circuits]);
    const visibleItems = selectingCircuits ? circuitOptions : activities;

    return (
        <ActivityPicker
            key={selectingCircuits ? 'circuits' : 'activities'}
            activities={visibleItems}
            activityGroups={activityGroups}
            title={showTypeToggle ? '' : title}
            searchPlaceholder={selectingCircuits ? 'Search activity circuits...' : searchPlaceholder}
            itemLabelSingular={selectingCircuits ? 'activity circuit' : 'activity'}
            itemLabelPlural={selectingCircuits ? 'activity circuits' : 'activities'}
            ungroupedLabel={selectingCircuits ? 'Ungrouped Activity Circuits' : 'Ungrouped'}
            selectionMode="single"
            allowActivitySelection
            allowGroupSelection={!selectingCircuits && allowGroupSelection}
            allowCreateActivity={!selectingCircuits && allowCreate}
            allowCopyActivity={!selectingCircuits && allowCopy}
            closeOnSelect={closeOnSelect}
            initialBrowseGroupId={selectingCircuits ? null : initialBrowseGroupId}
            groupSelectionLabel={groupSelectionLabel}
            groupSelectedLabel={groupSelectedLabel}
            showFooter={false}
            variant="panel"
            onClose={onClose}
            onCancel={onClose}
            onCreateActivity={onCreateActivityDefinition}
            onCopyActivity={onCopyActivityDefinition}
            canCopyActivity={canCopyActivity}
            headerLeading={showTypeToggle ? (
                <ViewToggleTabs
                    className={styles.typeToggle}
                    items={SELECTOR_VIEWS}
                    value={selectorView}
                    onChange={setSelectorView}
                    ariaLabel="Definition type"
                />
            ) : null}
            renderActivityDetails={selectingCircuits
                ? (circuit) => <CircuitActivityList circuit={circuit} />
                : null}
            onChange={({ activities: selectedActivities, groups: selectedGroups }) => {
                const group = selectedGroups[0];
                if (!selectingCircuits && group && onSelectGroup) {
                    onSelectGroup(group);
                    onClose?.();
                    return;
                }
                const activity = selectedActivities[0];
                if (!activity) return;
                if (selectingCircuits) {
                    onSelectCircuit?.(activity);
                    return;
                }
                onSelectActivity?.(activity);
            }}
        />
    );
}
