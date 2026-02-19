export function defaultSerialize(value) {
    try {
        return JSON.stringify(value ?? null);
    } catch {
        return '';
    }
}

export function createAutoSaveQueue({ save, serialize = defaultSerialize, onError } = {}) {
    if (typeof save !== 'function') {
        throw new Error('createAutoSaveQueue requires a save function');
    }

    let pending = null;
    let inFlight = false;
    let lastSavedSerialized = '';

    const flush = async () => {
        if (inFlight) return;

        inFlight = true;
        try {
            while (pending !== null) {
                const next = pending;
                pending = null;
                const serialized = serialize(next);

                if (!serialized || serialized === lastSavedSerialized) continue;

                await save(next);
                lastSavedSerialized = serialized;
            }
        } catch (error) {
            if (typeof onError === 'function') onError(error);
        } finally {
            inFlight = false;
        }
    };

    return {
        enqueue(value) {
            pending = value;
            return flush();
        },
        seed(value) {
            lastSavedSerialized = serialize(value);
        },
        reset() {
            pending = null;
            inFlight = false;
            lastSavedSerialized = '';
        },
        getLastSavedSerialized() {
            return lastSavedSerialized;
        }
    };
}
