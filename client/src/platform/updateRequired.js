let required = false;
const listeners = new Set();

/** The server no longer speaks to this build. Nothing works until it is updated, so it stays set. */
export function reportUpdateRequired() {
    if (required) return;
    required = true;
    listeners.forEach((listener) => listener());
}

export const isUpdateRequired = () => required;

export function subscribeUpdateRequired(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
