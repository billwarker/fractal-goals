// Runs in the app's own page before its scripts. `__SHELL__` is filled in by window.rs.
(() => {
    if (window.top !== window || location.protocol !== 'tauri:') return;
    const internals = window.__TAURI_INTERNALS__;
    const listen = (event, handler) => {
        let stopped = false;
        const listening = internals.invoke('plugin:event|listen', {
            event, target: { kind: 'Any' }, handler: internals.transformCallback(({ payload }) => !stopped && handler(payload)),
        });
        return () => {
            stopped = true;
            listening.then((eventId) => internals.invoke('plugin:event|unlisten', { event, eventId }));
        };
    };
    Object.defineProperty(window, '__FRACTAL_SHELL__', {
        value: Object.freeze({
            ...__SHELL__,
            invoke: (command, args) => internals.invoke(command, args),
            // Links wait in the app until taken, so the one that launched it isn't lost while the page loads.
            onOpenLink: (open) => {
                const take = () => internals.invoke('take_links').then((links) => links.forEach(open));
                const stop = listen('links-waiting', take);
                take();
                return stop;
            },
            onMenu: (choose) => listen('menu', choose),
        }),
    });
})();
