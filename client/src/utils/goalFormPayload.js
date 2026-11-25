import { buildConditionPayload } from './goalConditions';

// Mirrors the server's MERGE_FIELDS for goals (services/sync_merge_service.py).
const MERGE_FIELDS = ['name', 'description', 'deadline'];
// The server reads each of these as one setting.
const PAIRS = [['completion_condition', 'condition'], ['review_cadence_value', 'review_cadence_unit']];

const isSame = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

function toPayload(values, usesReviews) {
    return {
        name: values.name,
        description: values.description,
        deadline: values.deadline || null,
        inherit_parent_activities: values.inheritParentActivities,
        track_activities: values.trackActivities,
        completion_condition: values.completionCondition,
        ...(values.completionCondition === 'activity_threshold'
            ? { condition: buildConditionPayload(values.conditionDraft) } : {}),
        ...(values.startedAt ? { started_at: values.startedAt } : {}),
        ...(usesReviews ? {
            review_cadence_value: values.reviewCadence?.value ?? null,
            review_cadence_unit: values.reviewCadence?.unit ?? null,
            review_disabled: !values.reviewsOn,
        } : {}),
    };
}

/**
 * What an edit changed, with what each mergeable field held when it began (`_base`), so saving never
 * undoes another device's change to a field this edit left alone. Null when nothing changed.
 */
export function goalFormChanges({ values, startingValues, usesReviews = false, attachments = null, savedAttachments = null }) {
    const before = toPayload(startingValues, usesReviews);
    const after = toPayload(values, usesReviews);
    const changes = Object.fromEntries(Object.entries(after).filter(([field, value]) => !isSame(value, before[field])));
    PAIRS.forEach((pair) => {
        if (pair.some((field) => field in changes)) {
            pair.filter((field) => field in after).forEach((field) => { changes[field] = after[field]; });
        }
    });
    const saved = savedAttachments?.map(({ asset_id, alt_text }) => ({ asset_id, alt_text: alt_text || '' }));
    if (attachments && !isSame(attachments, saved)) changes.attachments = attachments;
    if (Object.keys(changes).length === 0) return null;
    const base = Object.fromEntries(MERGE_FIELDS.filter((field) => field in changes).map((field) => [field, before[field]]));
    return Object.keys(base).length ? { ...changes, _base: base } : changes;
}
