import { createMemoryStore } from './outbox';

// Minimal promise wrapper over one IndexedDB object store keyed by `opId`.
// Each signed-in user gets their own database so a shared device never mixes
// queues. When IndexedDB is unavailable (some private modes) writes still work
// for the life of the tab via the in-memory store, and the store says so
// (`isVolatile`) until IndexedDB opens again and takes the queued ops over.

const STORE_NAME = 'ops';
const DB_VERSION = 1;
// What a connection the browser dropped throws (iOS Safari after backgrounding, a
// versionchange, a crash in the storage process). A fresh connection fixes it.
const LOST_CONNECTION_ERRORS = new Set(['InvalidStateError', 'UnknownError', 'TransactionInactiveError']);
// While on the memory fallback, IndexedDB is tried again at most this often.
const REOPEN_INTERVAL_MS = 30000;

function requestAsPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function openDatabase(factory, name) {
    return new Promise((resolve, reject) => {
        const request = factory.open(name, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'opId' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Offline store is blocked by another tab'));
    });
}

export function outboxDatabaseName(userId) {
    return `fractal-outbox:${userId}`;
}

export function createIndexedDbStore(userId, {
    factory = typeof indexedDB === 'undefined' ? null : indexedDB,
    now = () => Date.now(),
    onEvent = () => {},
} = {}) {
    if (!factory) return { ...createMemoryStore(), isVolatile: () => true };

    let dbPromise = null;
    let fallback = null;
    let lastOpenAttemptAt = 0;

    const database = () => {
        if (!dbPromise) {
            lastOpenAttemptAt = now();
            dbPromise = openDatabase(factory, outboxDatabaseName(userId)).then((db) => {
                const forget = () => {
                    if (dbPromise === opened) dbPromise = null;
                };
                db.onclose = forget;
                db.onversionchange = () => {
                    db.close();
                    forget();
                };
                return db;
            });
            const opened = dbPromise;
            opened.catch(() => {
                if (dbPromise === opened) dbPromise = null;
            });
        }
        return dbPromise;
    };

    const transact = async (mode, operation) => {
        const db = await database();
        // Strict: a put resolves only once the change is on disk, so "saved" survives a crash.
        const transaction = db.transaction(STORE_NAME, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
        const done = new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        const result = await operation(transaction.objectStore(STORE_NAME), null);
        await done;
        return result;
    };

    /** Back from the memory fallback: move what was queued meanwhile into IndexedDB. */
    const leaveFallback = async () => {
        const held = await fallback.getAll();
        await transact('readwrite', (store) => Promise.all(held.map((op) => requestAsPromise(store.put(op)))));
        fallback = null;
        onEvent('store_reopened', { moved: held.length });
    };

    const run = async (mode, operation) => {
        if (fallback) {
            if (now() - lastOpenAttemptAt < REOPEN_INTERVAL_MS) return operation(null, fallback);
            try {
                await leaveFallback();
            } catch {
                return operation(null, fallback);
            }
        }
        try {
            return await transact(mode, operation);
        } catch (error) {
            let failure = error;
            if (LOST_CONNECTION_ERRORS.has(error?.name)) {
                dbPromise = null;
                try {
                    // Every operation here is safe to repeat: get, put, delete or clear by key.
                    return await transact(mode, operation);
                } catch (retryError) {
                    failure = retryError;
                }
            }
            // Opened fine, so the operation itself failed (a quota error, say): the caller decides.
            if (dbPromise && !LOST_CONNECTION_ERRORS.has(failure?.name)) throw failure;
            console.error('[outbox] IndexedDB unavailable; changes will only survive this tab', failure);
            dbPromise = null;
            fallback = createMemoryStore();
            onEvent('store_volatile', { name: failure?.name || 'Error' });
            return operation(null, fallback);
        }
    };

    return {
        getAll: () => run('readonly', (store, memory) => (memory ? memory.getAll() : requestAsPromise(store.getAll()))),
        put: (op) => run('readwrite', (store, memory) => (memory ? memory.put(op) : requestAsPromise(store.put(op)))),
        delete: (opId) => run('readwrite', (store, memory) => (memory ? memory.delete(opId) : requestAsPromise(store.delete(opId)))),
        clear: () => run('readwrite', (store, memory) => (memory ? memory.clear() : requestAsPromise(store.clear()))),
        isVolatile: () => Boolean(fallback),
    };
}
