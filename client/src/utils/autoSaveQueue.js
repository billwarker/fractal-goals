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
        while (pending !== null) {
            const batch = pending;
            pending = null;
            const serialized = serialize(batch.value);

            if (!serialized || serialized === lastSavedSerialized) {
                batch.resolve(undefined);
                continue;
            }

            try {
                const result = await save(batch.value);
                lastSavedSerialized = serialized;
                batch.resolve(result);
            } catch (error) {
                if (typeof onError === 'function') onError(error);
                batch.resolve({ error });
            }
        }
        inFlight = false;
    };

    return {
        enqueue(value) {
            const serialized = serialize(value);
            if (!pending && !inFlight && serialized && serialized === lastSavedSerialized) {
                return Promise.resolve(undefined);
            }

            const completion = new Promise((resolve) => {
                if (pending) {
                    const previousResolve = pending.resolve;
                    pending = {
                        value,
                        resolve: (result) => {
                            previousResolve(result);
                            resolve(result);
                        },
                    };
                    return;
                }
                pending = { value, resolve };
            });
            void flush();
            return completion;
        },
        seed(value) {
            lastSavedSerialized = serialize(value);
        },
        reset() {
            pending?.resolve(undefined);
            pending = null;
            inFlight = false;
            lastSavedSerialized = '';
        },
        getLastSavedSerialized() {
            return lastSavedSerialized;
        }
    };
}
