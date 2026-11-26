// Queues writes to goals and notes when there is no signal. Online they go straight to the server.

import { queryKeys } from '../hooks/queryKeys';
import {
    buildConditionPayload, conditionToDraft, getGoalCompletionCondition, getGoalCondition,
} from '../utils/goalConditions';
import { findGoalInTree, mergeGoalRecord } from '../utils/goalTreeCache';
import { activityMetricId, activitySplitId } from './circuitIds';
import { RECORD_OP } from './opKinds';
import { defaultId as createId } from './outboxTransport';
import { recordScope } from './recordQueue';
import { buildPlaceholderNote, nowIso } from './sessionOps';

// Mirrors the server's MERGE_FIELDS for goals (services/sync_merge_service.py).
const GOAL_MERGE_FIELDS = ['name', 'description', 'deadline'];

function buildPlaceholderGoal(id, rootId, data) {
    return {
        id,
        name: data.name,
        type: data.type,
        description: data.description || '',
        deadline: data.deadline || null,
        started_at: data.started_at || null,
        completed: false,
        paused: false,
        completion_condition: data.completion_condition || 'manual',
        condition: null,
        children: [],
        attributes: {
            id,
            type: data.type,
            parent_id: data.parent_id,
            root_id: rootId,
            associated_activity_ids: [],
            associated_activity_group_ids: [],
        },
        _pendingSync: true,
    };
}

const goalValue = (goal, field) => goal[field] ?? goal.attributes?.[field] ?? null;
const day = (value) => (typeof value === 'string' ? value.slice(0, 10) : value);
const isSame = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

/**
 * What an edit really changes. The goal form sends every field; queued whole, it would later undo
 * another device's change to a field this edit never touched.
 */
export function changedGoalFields(goal, updates, savedAttachments = null) {
    const draft = getGoalCondition(goal) ? buildConditionPayload(conditionToDraft(getGoalCondition(goal))) : null;
    const unchanged = {
        name: (value) => isSame(value, goalValue(goal, 'name')),
        description: (value) => isSame(value || '', goalValue(goal, 'description') || ''),
        deadline: (value) => isSame(day(value), day(goalValue(goal, 'deadline'))),
        started_at: (value) => isSame(day(value), day(goalValue(goal, 'started_at'))),
        completion_condition: (value) => isSame(value, getGoalCompletionCondition(goal)),
        condition: (value) => isSame(value, draft),
        review_cadence_value: (value) => isSame(value, goalValue(goal, 'review_cadence_value')),
        review_cadence_unit: (value) => isSame(value, goalValue(goal, 'review_cadence_unit')),
        review_disabled: (value) => isSame(value, goalValue(goal, 'review_disabled') ?? false),
        attachments: (value) => savedAttachments !== null && isSame(
            value.map((item) => item.asset_id), savedAttachments.map((item) => item.asset_id),
        ),
    };
    const entries = Object.entries(updates).filter(([field, value]) => (
        unchanged[field] ? !unchanged[field](value) : !isSame(value, goalValue(goal, field))
    ));
    const changed = Object.fromEntries(entries);
    // These belong together: the server reads each pair as one setting.
    [['completion_condition', 'condition'], ['review_cadence_value', 'review_cadence_unit']].forEach((pair) => {
        if (!pair.some((field) => field in changed)) return;
        pair.filter((field) => field in updates).forEach((field) => {
            changed[field] = updates[field];
        });
    });
    return changed;
}

export async function queueGoalCreate(outbox, rootId, data) {
    const id = createId();
    const placeholder = buildPlaceholderGoal(id, rootId, data);
    await outbox.submit({
        scope: recordScope(rootId),
        kind: RECORD_OP.GOAL_CREATE,
        method: 'post',
        url: `/${rootId}/goals`,
        body: { ...data, id },
        creates: [id],
        meta: { rootId, goalId: id, placeholder },
    });
    return placeholder;
}

export async function queueGoalUpdate(outbox, queryClient, rootId, goalId, { _base: startedFrom, ...updates }) {
    const current = findGoalInTree(queryClient.getQueryData(queryKeys.fractalTree(rootId)), goalId) || { id: goalId };
    const changes = changedGoalFields(
        current, updates, queryClient.getQueryData(queryKeys.goalAttachments(rootId, goalId)) ?? null,
    );
    if (Object.keys(changes).length === 0) return current;
    const base = Object.fromEntries(
        GOAL_MERGE_FIELDS.filter((field) => field in changes && field in current).map((field) => [field, startedFrom?.[field] ?? current[field]]),
    );
    await outbox.submit({
        scope: recordScope(rootId),
        kind: RECORD_OP.GOAL_UPDATE,
        method: 'put',
        url: `/${rootId}/goals/${goalId}`,
        body: { ...changes, _base: base, _edited_at: nowIso() },
        entityIds: [goalId],
        meta: { rootId, goalId, updates: changes },
    });
    return mergeGoalRecord(current, changes);
}

export async function queueNoteCreate(outbox, rootId, data) {
    const id = createId();
    const note = buildPlaceholderNote({ id, data: { ...data, root_id: rootId } });
    await outbox.submit({
        scope: recordScope(rootId),
        kind: RECORD_OP.NOTE_CREATE,
        method: 'post',
        url: `/${rootId}/notes`,
        body: { ...data, id },
        creates: [id],
        meta: { rootId, goalId: data.goal_id || data.context_id, note },
    });
    return { data: note };
}

export async function queueNoteUpdate(outbox, rootId, note, content) {
    await outbox.submit({
        scope: recordScope(rootId),
        kind: RECORD_OP.NOTE_UPDATE,
        method: 'put',
        url: `/${rootId}/notes/${note.id}`,
        body: {
            content,
            ...(note.content === undefined ? {} : { _base: { content: note.content } }),
            _edited_at: nowIso(),
        },
        entityIds: [note.id],
        meta: { rootId, noteId: note.id, content },
    });
    return { data: { ...note, content } };
}

export async function queueNoteDelete(outbox, rootId, note) {
    await outbox.submit({
        scope: recordScope(rootId),
        kind: RECORD_OP.NOTE_DELETE,
        method: 'delete',
        url: `/${rootId}/notes/${note.id}`,
        entityIds: [note.id],
        supersedes: [note.id],
        meta: { rootId, noteId: note.id },
    });
    return { data: null };
}

/** An activity made offline can be logged at once: its metrics and splits have the ids the server will give them. */
export async function queueActivityCreate(outbox, rootId, data) {
    const id = createId();
    const metrics = (data.metrics || []).filter((metric) => metric.name && metric.unit);
    const splits = (data.splits || []).filter((split) => split.name);
    const placeholder = {
        id,
        name: data.name,
        description: data.description || '',
        group_id: data.group_id || null,
        has_sets: Boolean(data.has_sets),
        has_metrics: data.has_metrics ?? true,
        metrics_multiplicative: Boolean(data.metrics_multiplicative),
        has_splits: Boolean(data.has_splits),
        track_progress: data.track_progress ?? null,
        progress_aggregation: data.progress_aggregation ?? null,
        delta_display_mode: data.delta_display_mode ?? null,
        created_at: nowIso(),
        metric_definitions: await Promise.all(metrics.map(async (metric, index) => ({
            input_type: 'number',
            precision: 2,
            is_active: true,
            is_multiplicative: true,
            track_progress: true,
            ...metric,
            id: await activityMetricId(id, index),
        }))),
        split_definitions: await Promise.all(splits.map(async (split, index) => ({
            ...split, order: index, id: await activitySplitId(id, index),
        }))),
        associated_goal_ids: data.goal_ids || [],
        associated_goals: [],
        _pendingSync: true,
    };
    await outbox.submit({
        scope: recordScope(rootId),
        kind: RECORD_OP.ACTIVITY_CREATE,
        method: 'post',
        url: `/${rootId}/activities`,
        body: { ...data, id },
        creates: [id],
        meta: { rootId, placeholder },
    });
    return placeholder;
}

export async function queueTemplateCreate(outbox, rootId, data) {
    const id = createId();
    const at = nowIso();
    const placeholder = {
        id, root_id: rootId, revision: 1, is_archived: false, archived_at: null, is_effectively_active: true,
        is_used_in_active_program: false, created_at: at, updated_at: at, stats: {}, goals: [], description: '',
        ...data, _pendingSync: true,
    };
    await outbox.submit({
        scope: recordScope(rootId),
        kind: RECORD_OP.TEMPLATE_CREATE,
        method: 'post',
        url: `/${rootId}/session-templates`,
        body: { ...data, id },
        creates: [id],
        meta: { rootId, placeholder },
    });
    return placeholder;
}

/** `expected_revision` makes the server refuse this, for review, if another device changed the content meanwhile. */
export async function queueTemplateUpdate(outbox, rootId, templateId, updates) {
    await outbox.submit({
        scope: recordScope(rootId),
        kind: RECORD_OP.TEMPLATE_UPDATE,
        method: 'put',
        url: `/${rootId}/session-templates/${templateId}`,
        body: { ...updates, _edited_at: nowIso() },
        // A newer save replaces an unsent one: both were made against the same revision.
        coalesceKey: `template:${templateId}`,
        entityIds: [templateId],
        meta: { rootId, templateId, updates },
    });
}
