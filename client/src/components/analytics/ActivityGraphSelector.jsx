import React, { useMemo, useState } from 'react';

import Button from '../atoms/Button';
import ActivityFilterModal from '../common/ActivityFilterModal';
import styles from './ActivityGraphSelector.module.css';

function ActivityGraphSelector({
    activities = [],
    activityGroups = [],
    value = null,
    values = [],
    onChange,
    onChangeMany,
    placeholder = 'Select activity...',
    disabled = false,
    multiple = false,
    activityCounts = {},
    groupCounts = {},
}) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const selectedActivities = useMemo(() => {
        if (multiple) {
            return (values || []).map((selected) => (
                activities.find((activity) => activity.id === selected.id) || selected
            ));
        }

        if (!value) {
            return [];
        }

        return [activities.find((activity) => activity.id === value.id) || value];
    }, [activities, multiple, value, values]);

    const groupMap = useMemo(() => {
        const map = {};
        activityGroups.forEach((group) => { map[group.id] = group; });
        return map;
    }, [activityGroups]);

    const triggerLabel = useMemo(() => {
        if (selectedActivities.length === 0) {
            return placeholder;
        }
        if (selectedActivities.length === 1) {
            const activity = selectedActivities[0];
            const group = activity.group_id ? groupMap[activity.group_id] : null;
            return group ? `${group.name} › ${activity.name}` : activity.name;
        }
        if (!multiple) {
            return selectedActivities[0].name;
        }
        return `${selectedActivities.length} activities selected`;
    }, [groupMap, multiple, placeholder, selectedActivities]);

    return (
        <>
            <div className={styles.container}>
                <Button
                    variant="secondary"
                    size="sm"
                    className={styles.trigger}
                    onClick={() => {
                        if (!disabled) {
                            setIsModalOpen(true);
                        }
                    }}
                    disabled={disabled}
                >
                    <span className={styles.triggerLabel}>{triggerLabel}</span>
                    <span className={styles.triggerChevron} aria-hidden="true">▾</span>
                </Button>
            </div>

            {isModalOpen && (
                <ActivityFilterModal
                    title="Filter by Activity"
                    activities={activities}
                    activityGroups={activityGroups}
                    initialActivityIds={selectedActivities.map((activity) => activity.id)}
                    initialGroupIds={[]}
                    selectionMode={multiple ? 'multiple' : 'single'}
                    allowGroupSelection={multiple}
                    activityCounts={activityCounts}
                    groupCounts={groupCounts}
                    confirmLabel={multiple ? 'Apply selection' : 'Select activity'}
                    onConfirm={(selectedActivityIds) => {
                        if (multiple) {
                            const nextActivities = selectedActivityIds
                                .map((activityId) => activities.find((activity) => activity.id === activityId))
                                .filter(Boolean);
                            onChangeMany?.(nextActivities);
                            return;
                        }

                        const nextActivity = selectedActivityIds.length > 0
                            ? activities.find((activity) => activity.id === selectedActivityIds[0]) || null
                            : null;
                        onChange?.(nextActivity);
                    }}
                    onClose={() => setIsModalOpen(false)}
                />
            )}
        </>
    );
}

export default ActivityGraphSelector;
