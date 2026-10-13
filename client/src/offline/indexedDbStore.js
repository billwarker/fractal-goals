import { createMemoryStore } from './outbox';

// Minimal promise wrapper over one IndexedDB object store keyed by `opId`.
// Each signed-in user gets their own database so a shared device never mixes
// queues. When IndexedDB is unavailable (some private modes) writes still work
// for the life of the tab via the in-memory store.

const STORE_NAME = 'ops';
const DB_VERSION = 1;

function requestAsPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function openDatabase(name) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, DB_VERSION);
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

export function createIndexedDbStore(userId) {
    if (typeof indexedDB === 'undefined') return createMemoryStore();

    let dbPromise = null;
    let fallback = null;
    const database = () => {
        dbPromise ??= openDatabase(outboxDatabaseName(userId));
        return dbPromise;
    };

    const run = async (mode, operation) => {
        if (fallback) return operation(null, fallback);
        let db;
        try {
            db = await database();
        } catch (error) {
            console.error('[outbox] IndexedDB unavailable; changes will only survive this tab', error);
            fallback = createMemoryStore();
            return operation(null, fallback);
        }
        const transaction = db.transaction(STORE_NAME, mode);
        const done = new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        const result = await operation(transaction.objectStore(STORE_NAME), null);
        await done;
        return result;
    };

    return {
        getAll: () => run('readonly', (store, memory) => (memory ? memory.getAll() : requestAsPromise(store.getAll()))),
        put: (op) => run('readwrite', (store, memory) => (memory ? memory.put(op) : requestAsPromise(store.put(op)))),
        delete: (opId) => run('readwrite', (store, memory) => (memory ? memory.delete(opId) : requestAsPromise(store.delete(opId)))),
        clear: () => run('readwrite', (store, memory) => (memory ? memory.clear() : requestAsPromise(store.clear()))),
    };
}
