// Tiny key/value store over IndexedDB for device-local offline state.
// Every call degrades to a no-op when IndexedDB is unavailable.

const DB_NAME = 'fractal-offline-kv';
const STORE_NAME = 'kv';

let dbPromise = null;

function openDatabase() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    dbPromise ??= new Promise((resolve) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
    return dbPromise;
}

async function run(mode, operation) {
    const db = await openDatabase();
    if (!db) return undefined;
    return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => resolve(undefined);
        transaction.onabort = () => resolve(undefined);
    });
}

export const idbGet = (key) => run('readonly', (store) => store.get(key));
export const idbSet = (key, value) => run('readwrite', (store) => store.put(value, key));
export const idbDelete = (key) => run('readwrite', (store) => store.delete(key));

/** Delete every key starting with ``prefix`` (string keys sort, so it's one key range). */
export const idbDeletePrefix = (prefix) => run('readwrite', (store) => (
    store.delete(IDBKeyRange.bound(prefix, `${prefix}\uffff`))
));
