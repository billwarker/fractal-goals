/** Shared wording for cloud storage connections (Settings, the attach dialog and the OAuth return page). */
export const STORAGE_PROVIDERS = {
    google_drive: {
        label: 'Google Drive',
        scope: 'Fractal Goals can open only files you pick or upload through Fractal Goals.',
        destination: 'Uploads go to a “Fractal Goals” folder in your Drive.',
    },
    dropbox: {
        label: 'Dropbox',
        scope: 'Fractal Goals can open only the Apps/Fractal Goals folder.',
        destination: 'Uploads go to Apps/Fractal Goals in your Dropbox.',
    },
};

export const providerLabel = (provider) => STORAGE_PROVIDERS[provider]?.label || 'Cloud storage';

// Mirrors CALLBACK_RESULTS in blueprints/storage_api.py; anything else reads as `failed`.
const RESULTS = {
    connected: (label) => `${label} connected.`,
    cancelled: (label) => `${label} connection cancelled. Nothing was changed.`,
    expired: () => 'That connection request expired. Connect again.',
    wrong_browser: () => 'Finish connecting in the browser where you started. Connect again from here.',
    account_mismatch: (label) => `Reconnect the same ${label} account you used before, so existing attachments keep working.`,
    permissions: (label) => `${label} didn’t grant the access Fractal Goals needs. Connect again and allow access.`,
    unavailable: (label) => `${label} is unavailable right now. Try again in a few minutes.`,
    failed: (label) => `${label} couldn’t be connected. Try again.`,
};

export function connectionResult(provider, result) {
    const known = Object.hasOwn(RESULTS, result) ? result : 'failed';
    return { ok: known === 'connected', result: known, message: RESULTS[known](providerLabel(provider)) };
}

export const STORAGE_CHANNEL = 'fractal-storage';
