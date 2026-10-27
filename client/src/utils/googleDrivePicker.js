let loading;

function loadPicker() {
    if (window.google?.picker) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timeout = setTimeout(() => fail(), 20000);
        function fail() {
            clearTimeout(timeout);
            script.remove();
            loading = null;
            reject(new Error('Google Picker could not load. Try again.'));
        }
        script.src = 'https://apis.google.com/js/api.js';
        script.async = true;
        script.onerror = fail;
        script.onload = () => window.gapi.load('picker', {
            callback: () => { clearTimeout(timeout); resolve(); }, onerror: fail,
        });
        document.head.appendChild(script);
    });
    return loading;
}

export async function chooseGoogleDriveFile(credentials, signal) {
    await loadPicker();
    if (signal?.aborted) return null;
    return new Promise((resolve, reject) => {
        const google = window.google;
        let picker;
        let finished = false;
        const finish = (file, error) => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            signal?.removeEventListener('abort', cancel);
            picker?.setVisible(false);
            picker?.dispose?.();
            if (error) reject(error);
            else resolve(file);
        };
        const cancel = () => finish(null);
        const timeout = setTimeout(() => finish(null, new Error('Google Picker did not finish. Check access and try again.')), 120000);
        signal?.addEventListener('abort', cancel, { once: true });
        try {
            const view = new google.picker.DocsView().setMimeTypes(
                'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm',
            ).setIncludeFolders(true).setSelectFolderEnabled(false);
            picker = new google.picker.PickerBuilder()
                .setAppId(credentials.app_id)
                .setDeveloperKey(credentials.api_key)
                .setOAuthToken(credentials.access_token)
                .setOrigin(window.location.origin)
                .addView(view)
                .setCallback((data) => {
                    if (data.action === google.picker.Action.PICKED) {
                        finish(data.docs[0]);
                    } else if (data.action === google.picker.Action.CANCEL) {
                        finish(null);
                    }
                }).build();
            picker.setVisible(true);
        } catch (error) { finish(null, error); }
    });
}
