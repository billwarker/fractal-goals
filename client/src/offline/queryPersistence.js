import { hydrate } from '@tanstack/react-query';

import { idbDelete, idbDeletePrefix, idbGet, idbGetPrefix, idbSet } from './idbKeyValue';

// Keeps the user's own data readable with no signal: every screen they have opened on this device
// shows what it last held. Each query is its own record, so one change rewrites one record.

// What an open session needs. Versioned by the server's recorded shapes
// (scripts/offline-cache-version.mjs), so these outlive a deploy that leaves them alone.
const SESSION_PREFIXES = new Set([
    'session',
    'session-activities',
    'circuit-runs',
    'session-notes',
    'session-goals-view',
    'activities',
    'activity-groups',
    'activity-tag-catalog',
    'circuits',
    'session-templates',
]);
// Everything else worth reading. Their shapes aren't recorded, so a new build starts them afresh.
const READING_PREFIXES = new Set([
    'fractals',
    'fractalTree',
    'root-goal',
    'goals',
    'goals-tree',
    'goalsForSelection',
    'goalLevels',
    'goalCondition',
    'goalSequence',
    'goalTimeline',
    'goalActivities',
    'goalActivityGroups',
    'goal-notes',
    'goalMetrics',
    'page-surfaces',
    'fractal-metrics',
    'sessions',
    'progress',
    'activity-history',
    'programs',
    'program',
    'program-calendar',
    'program-day-read-model',
    'program-day-options',
    'program-session-plans',
    'program-metrics',
    'calendar-periods',
    'all-notes',
    'note-filters',
]);
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const WRITE_THROTTLE_MS = 1000;
export const MAX_RECORDS = 400;
export const MAX_RECORD_CHARS = 2_000_000;
const MAX_TOTAL_CHARS = 25_000_000;
// Restored queries nobody has opened yet stay in memory as long as the app might be offline.
const RESTORED_GC_MS = 24 * 60 * 60 * 1000;

export const CACHE_VERSION = __OFFLINE_CACHE_VERSION__;
const BUILD_VERSION = `${CACHE_VERSION}:${import.meta.env.VITE_APP_VERSION || 'dev'}`;

const legacyKey = (userId) => `query-cache:${userId}`;
const recordPrefix = (userId) => `query:${userId}:`;
const recordKey = (userId, queryHash) => `${recordPrefix(userId)}${queryHash}`;
const versionFor = (prefix) => (SESSION_PREFIXES.has(prefix) ? CACHE_VERSION : BUILD_VERSION);
const isPersistedPrefix = (prefix) => SESSION_PREFIXES.has(prefix) || READING_PREFIXES.has(prefix);

export function shouldPersistQuery(query) {
    return query.state.status === 'success' && isPersistedPrefix(query.queryKey?.[0]);
}

/** Session data first, then the newest, within the device's budget. */
export function selectRecords(records) {
    const rank = (record) => (SESSION_PREFIXES.has(record.prefix) ? 1 : 0);
    const ordered = [...records].sort((left, right) => rank(right) - rank(left) || right.updatedAt - left.updatedAt);
    let total = 0;
    const kept = [];
    const dropped = [];
    ordered.forEach((record) => {
        total += record.size;
        if (kept.length < MAX_RECORDS && total <= MAX_TOTAL_CHARS) kept.push(record);
        else dropped.push(record);
    });
    return { kept, dropped };
}

async function loadLegacyCache(userId, now) {
    const saved = await idbGet(legacyKey(userId));
    if (!saved) return [];
    await idbDelete(legacyKey(userId));
    return saved.buster === CACHE_VERSION && now - saved.timestamp <= MAX_AGE_MS ? saved.state.queries : [];
}

/** Hydrate the user's persisted data. Returns true when something was restored. */
export async function restoreQueryCache(queryClient, userId, { now = Date.now() } = {}) {
    if (!userId) return false;
    const legacy = await loadLegacyCache(userId, now);
    const records = (await idbGetPrefix(recordPrefix(userId))) || [];
    const current = records.filter((record) => (
        record.version === versionFor(record.prefix) && now - record.updatedAt <= MAX_AGE_MS
    ));
    const { kept, dropped } = selectRecords(current);
    const keptHashes = new Set(kept.map((record) => record.query.queryHash));
    [...records.filter((record) => !current.includes(record)), ...dropped].forEach((record) => {
        void idbDelete(recordKey(userId, record.query.queryHash));
    });
    const queries = [...legacy.filter((query) => !keptHashes.has(query.queryHash)), ...kept.map((record) => record.query)];
    if (queries.length === 0) return false;
    legacy.forEach((query) => saveRecord(userId, query));
    // Hydrate never overwrites data newer than the persisted copy.
    hydrate(queryClient, { mutations: [], queries }, { defaultOptions: { queries: { gcTime: RESTORED_GC_MS } } });
    // The copy can trail the server (writes are throttled), so what it restored is shown
    // at once but refetched on mount when online; offline it stays as the data.
    const cache = queryClient.getQueryCache();
    for (const { queryKey, state } of queries) {
        const query = cache.find({ queryKey, exact: true });
        if (query?.state.dataUpdatedAt === state.dataUpdatedAt) query.invalidate();
    }
    return true;
}

// Counts sign-outs, so a write still waiting then can't put cleared data back.
let clears = 0;

export function clearPersistedQueryCache(userId) {
    clears += 1;
    if (!userId) return Promise.resolve();
    return Promise.all([idbDelete(legacyKey(userId)), idbDeletePrefix(recordPrefix(userId))]);
}

function toRecord({ queryKey, queryHash, state }) {
    const [prefix] = queryKey;
    const size = JSON.stringify(state.data ?? null).length;
    if (size > MAX_RECORD_CHARS) return null;
    return {
        prefix,
        version: versionFor(prefix),
        updatedAt: state.dataUpdatedAt,
        size,
        query: { queryKey, queryHash, state: { ...state, fetchStatus: 'idle' } },
    };
}

function saveRecord(userId, query) {
    const record = toRecord(query);
    if (record) void idbSet(recordKey(userId, query.queryHash), record);
}

/** Keep the persisted copy current while offline sync is on. Returns a stop function. */
export function startQueryPersistence(queryClient, userId) {
    const startedAt = clears;
    const waiting = new Map();
    const writtenAt = new Map();
    const write = (query) => {
        waiting.delete(query.queryHash);
        writtenAt.set(query.queryHash, Date.now());
        if (clears === startedAt && shouldPersistQuery(query)) saveRecord(userId, query);
    };
    // Each query at once, then at most once a second: a write begun as the page closes may not finish.
    const note = (query) => {
        if (waiting.has(query.queryHash)) return;
        const delay = Math.max(0, (writtenAt.get(query.queryHash) ?? 0) + WRITE_THROTTLE_MS - Date.now());
        waiting.set(query.queryHash, { query, timer: setTimeout(() => write(query), delay) });
    };
    // The first screen can load before the engine that calls this.
    queryClient.getQueryCache().getAll().filter(shouldPersistQuery).forEach(note);
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        if (event?.type === 'updated' && event.action?.type === 'success' && isPersistedPrefix(event.query.queryKey?.[0])) {
            note(event.query);
        }
    });
    const flush = () => {
        waiting.forEach(({ query, timer }) => {
            clearTimeout(timer);
            write(query);
        });
    };
    const flushOnHide = () => {
        if (document.visibilityState === 'hidden') flush();
    };
    // A reload or close doesn't always report the page hidden first.
    document.addEventListener('visibilitychange', flushOnHide);
    window.addEventListener('pagehide', flush);
    return () => {
        unsubscribe();
        document.removeEventListener('visibilitychange', flushOnHide);
        window.removeEventListener('pagehide', flush);
        flush();
    };
}
