import React, { useMemo, useState } from 'react';

import { useActivityTagCatalog } from '../../hooks/useActivityTagCatalog';
import Button from '../atoms/Button';
import { ActivityPickerModal } from '../activityPicker';
import ActivityTagBadges from '../common/ActivityTagBadges';
import { ConditionTagFilter } from '../goalDetail/ConditionEditorFields';
import styles from './ProgramDayModal.module.css';

let nextKey = 0;

/** A new activity condition for the day's draft: required, untagged. */
export function newActivityCondition(activityDefinitionId) {
    nextKey += 1;
    return { key: `activity-${nextKey}`, activityDefinitionId, isRequired: true, tagIds: [], tagMatch: 'contains' };
}

/**
 * Activities a program day asks for, besides its sessions: any completed instance that date counts
 * (a quick session's included), optionally only when tagged. Each is required or optional.
 */
export default function ProgramDayActivitiesField({ rootId, activities, activityGroups, conditions, onChange }) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [taggingKey, setTaggingKey] = useState(null);
    const { data: catalog } = useActivityTagCatalog(rootId);
    const activitiesById = useMemo(() => new Map(activities.map((activity) => [activity.id, activity])), [activities]);
    const tagsById = useMemo(() => new Map(catalog.tags.map((tag) => [tag.id, tag])), [catalog.tags]);

    const update = (key, changes) => onChange(conditions.map((condition) => (
        condition.key === key ? { ...condition, ...changes } : condition
    )));

    return (
        <div className={styles.field}>
            <span className={styles.label} id="program-day-activities-label">Activities</span>
            {conditions.length > 0 ? (
                <ul className={styles.sessionList} aria-labelledby="program-day-activities-label">
                    {conditions.map((condition) => {
                        const activity = activitiesById.get(condition.activityDefinitionId);
                        const name = activity?.name || condition.activityName || 'Deleted activity';
                        const tags = condition.tagIds.map((id) => tagsById.get(id)).filter(Boolean);
                        const tagging = taggingKey === condition.key;
                        return (
                            <li key={condition.key} className={styles.activityItem}>
                                <div className={styles.activityRow}>
                                    <span className={styles.sessionName}>{name}</span>
                                    <ActivityTagBadges tags={tags} ariaLabel={`Tags required for ${name}`} />
                                    {activity ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            aria-expanded={tagging}
                                            onClick={() => setTaggingKey(tagging ? null : condition.key)}
                                        >
                                            {tags.length ? 'Edit tags' : 'Tags'}
                                        </Button>
                                    ) : null}
                                    <label className={styles.requiredCheckboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={condition.isRequired}
                                            onChange={() => update(condition.key, { isRequired: !condition.isRequired })}
                                            className={styles.checkbox}
                                            aria-label={`Mark ${name} required`}
                                        />
                                        <span>Required</span>
                                    </label>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onChange(conditions.filter((item) => item.key !== condition.key))}
                                        className={styles.removeSessionBtn}
                                        aria-label={`Remove ${name}`}
                                    >
                                        &times;
                                    </Button>
                                </div>
                                {tagging && activity ? (
                                    <ConditionTagFilter
                                        rootId={rootId}
                                        activityId={activity.id}
                                        tagIds={condition.tagIds}
                                        tagMatch={condition.tagMatch}
                                        usesSets={Boolean(activity.has_sets)}
                                        onChange={(tagIds) => update(condition.key, { tagIds })}
                                        onTagMatchChange={(tagMatch) => update(condition.key, { tagMatch })}
                                    />
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            ) : null}
            <div className={styles.sessionActions}>
                <Button type="button" size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
                    + Add Activity
                </Button>
            </div>
            <div className={styles.hint}>
                Done when completed in any session that day, a quick session included.
            </div>
            {pickerOpen ? (
                <ActivityPickerModal
                    title="Add an activity to this day"
                    activities={activities}
                    activityGroups={activityGroups}
                    selectionMode="single"
                    closeOnSelect
                    onConfirm={({ activityIds }) => {
                        const [activityId] = activityIds || [];
                        if (activityId) onChange([...conditions, newActivityCondition(activityId)]);
                        setPickerOpen(false);
                    }}
                    onCancel={() => setPickerOpen(false)}
                    onClose={() => setPickerOpen(false)}
                />
            ) : null}
        </div>
    );
}
