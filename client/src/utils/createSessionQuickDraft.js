// A quick session lives on the device as a draft until it is completed: the activities the
// user added, in order, each with the values entered in the plan editor's shape
// (`{ metrics }` or `{ sets: [{ metrics, notes }] }`, plus `notes`). Completing sends it to
// `POST /sessions/quick-complete`, which creates it already complete.

// Mirrors MAX_QUICK_SESSION_ACTIVITIES in services/_session_creation.py.
export const MAX_QUICK_SESSION_ACTIVITIES = 20;
export const QUICK_DRAFT_VERSION = 3;
export const QUICK_SESSION_NAME = 'Quick Session';

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';

function normalizeMetricValue(rawValue) {
    if (!hasValue(rawValue)) return null;
    if (typeof rawValue === 'string' && !Number.isNaN(Number(rawValue.trim()))) return Number(rawValue.trim());
    return rawValue;
}

/** Entered metric values, numeric where they can be, without blanks. */
export function sanitizeMetrics(metrics) {
    return (Array.isArray(metrics) ? metrics : [])
        .map((metric) => {
            const value = normalizeMetricValue(metric?.value);
            if (value == null) return null;
            return {
                metric_id: metric.metric_id || metric.metric_definition_id,
                ...(metric.split_id ? { split_id: metric.split_id } : {}),
                value,
            };
        })
        .filter(Boolean);
}

const cleanNote = (notes) => (typeof notes === 'string' && notes.trim() ? notes : null);

/**
 * What an activity instance (a past quick session's, or an older draft's) recorded, in the
 * plan editor's shape; null when it recorded nothing.
 */
export function recordedValues(instance) {
    const metrics = sanitizeMetrics(instance?.metrics || instance?.metric_values);
    const sets = (Array.isArray(instance?.sets) ? instance.sets : []).map((set) => ({
        metrics: sanitizeMetrics(set?.metrics),
        notes: cleanNote(set?.notes),
    }));
    const notes = cleanNote(instance?.notes);
    if (!metrics.length && !notes && !sets.some((set) => set.metrics.length || set.notes)) return null;
    return { ...(sets.length ? { sets } : { metrics }), ...(notes ? { notes } : {}) };
}

/**
 * One activity to log. A set activity starts with one empty set, or as many as ``previous``
 * (what was recorded last time, shown as placeholders) had.
 */
export function buildDraftItem(definition, { previous = null } = {}) {
    const hasSets = Boolean(definition?.has_sets);
    const setCount = Math.max(1, previous?.sets?.length || 0);
    return {
        key: `quick-item-${crypto.randomUUID()}`,
        activity_definition_id: definition.id,
        name: definition?.name || 'Activity',
        has_sets: hasSets,
        value: hasSets ? { sets: Array.from({ length: setCount }, () => ({ metrics: [], notes: null })) } : null,
        previous,
    };
}

/** An empty quick session. It starts (``startedAt``) when its first activity is added. */
export function createQuickDraft() {
    return { version: QUICK_DRAFT_VERSION, startedAt: null, items: [] };
}

export const canAddQuickActivity = (draft) => (draft?.items?.length || 0) < MAX_QUICK_SESSION_ACTIVITIES;

/** Appends activities, in order, up to the limit. ``entries`` are ``{ definition, previous? }``. */
export function addDraftActivities(draft, entries, { now = new Date() } = {}) {
    const base = draft || createQuickDraft();
    const room = MAX_QUICK_SESSION_ACTIVITIES - base.items.length;
    const added = entries
        .filter((entry) => entry?.definition?.id)
        .slice(0, Math.max(0, room))
        .map(({ definition, previous }) => buildDraftItem(definition, { previous: previous || null }));
    if (added.length === 0) return base;
    return { ...base, items: [...base.items, ...added], startedAt: base.startedAt || now.toISOString() };
}

export function removeDraftActivity(draft, key) {
    return { ...draft, items: draft.items.filter((item) => item.key !== key) };
}

export function moveDraftActivity(draft, index, direction) {
    const target = index + direction;
    if (target < 0 || target >= draft.items.length) return draft;
    const items = [...draft.items];
    [items[index], items[target]] = [items[target], items[index]];
    return { ...draft, items };
}

export function setDraftItemValue(draft, key, value) {
    return { ...draft, items: draft.items.map((item) => (item.key === key ? { ...item, value } : item)) };
}

/** Drafts saved by older versions (activity-instance shaped, some from templates) still resume. */
export function upgradeQuickDraft(saved) {
    if (!saved) return null;
    if (saved.version === QUICK_DRAFT_VERSION) return saved;
    if (!Array.isArray(saved.activityInstances)) return null;
    return {
        ...createQuickDraft(),
        startedAt: saved.startedAt || null,
        items: saved.activityInstances.map((instance) => ({
            key: `quick-item-${instance.id}`,
            activity_definition_id: instance.activity_definition_id,
            name: instance.name || 'Activity',
            has_sets: Boolean(instance.has_sets),
            value: recordedValues(instance),
            previous: null,
        })),
    };
}

/** The ``quick-complete`` body for a draft: its activities in order, with what was entered. */
export function buildQuickSessionPayload(draft) {
    return {
        name: QUICK_SESSION_NAME,
        ...(draft?.startedAt ? { session_start: draft.startedAt } : {}),
        activity_instances: (draft?.items || []).map((item) => ({
            activity_definition_id: item.activity_definition_id,
            has_sets: Boolean(item.has_sets),
            notes: item.value?.notes || '',
            metrics: item.has_sets ? [] : sanitizeMetrics(item.value?.metrics),
            // A set with nothing entered isn't logged.
            sets: item.has_sets
                ? (item.value?.sets || [])
                    .map((set) => ({ completed: true, metrics: sanitizeMetrics(set.metrics), notes: cleanNote(set.notes) }))
                    .filter((set) => set.metrics.length || set.notes)
                : [],
        })),
    };
}
