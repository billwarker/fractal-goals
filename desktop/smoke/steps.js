// Runs inside the smoke build's page (see src/smoke.rs). `__SMOKE__` is { step, ...what it needs }.
(() => {
    if (window.top !== window || location.protocol !== 'tauri:') return;
    const smoke = __SMOKE__;
    const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
    const report = (result) => invoke('smoke_report', { report: { step: smoke.step, ...result } });
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const until = async (what, find, timeout = 45_000) => {
        const end = Date.now() + timeout;
        for (;;) {
            const found = await find();
            if (found) return found;
            if (Date.now() > end) throw new Error(`Gave up waiting for ${what}`);
            await pause(200);
        }
    };
    const visible = (element) => element && element.getClientRects().length > 0;
    const byText = (text, selector = '*') => [...document.querySelectorAll(selector)]
        .find((element) => visible(element) && element.children.length === 0 && element.textContent.trim() === text);
    const button = (pattern) => [...document.querySelectorAll('button')].filter((element) => visible(element) && pattern.test(element.textContent.trim()));
    const field = (label) => {
        const tag = [...document.querySelectorAll('label')].find((element) => element.textContent.trim() === label);
        return tag && (tag.control || tag.querySelector('input'));
    };
    // React tracks the value it last set, so a plain assignment would be ignored.
    const type = (input, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const go = (path) => {
        history.pushState({}, '', path);
        dispatchEvent(new PopStateEvent('popstate'));
    };
    const signedIn = () => until('the fractal list', () => byText('New Fractal') || byText('+ NEW FRACTAL'));

    const steps = {
        async signIn() {
            (await until('LOG IN', () => byText('LOG IN'))).click();
            type(await until('the form', () => field('Username or Email')), smoke.username);
            type(field('Password'), smoke.password);
            button(/log in/i).at(-1).click();
            await signedIn();
            return {
                secureContext: window.isSecureContext,
                randomUUID: typeof crypto.randomUUID === 'function',
                locks: Boolean(navigator.locks),
                serviceWorkers: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
                keptSignIn: Boolean(await invoke('secret_get', { key: 'refresh-token' })),
            };
        },
        async reopen() {
            await signedIn();
            go(`/${smoke.root}/goals?goal=${smoke.goalId}`);
            await until('the goal', () => document.querySelector(`input[value="${smoke.goalName}"]`) || byText(smoke.goalName));
            const timer = await until('the menu-bar timer', async () => (await invoke('smoke_state')).timer);
            // Long enough for this page to be kept for reading offline.
            await pause(3000);
            return { timer };
        },
        async offline() {
            await signedIn();
            go(`/${smoke.root}/goals?goal=${smoke.goalId}`);
            (await until('Edit', () => button(/^Edit$/)[0])).click();
            const input = await until('the name field', () => document.querySelector(`input[value="${smoke.goalName}"]`));
            type(input, smoke.newName);
            button(/^Save/)[0].click();
            await until('the saved-here notice', () => [...document.querySelectorAll('[role="status"]')]
                .find((element) => /saved on this device/i.test(element.textContent)));
            return { queued: (await invoke('queue_all', { userId: smoke.userId })).length };
        },
        async drain() {
            await signedIn();
            await until('the queue to empty', async () => (await invoke('queue_all', { userId: smoke.userId })).length === 0);
            return { queued: 0 };
        },
    };

    if (sessionStorage.getItem('smoke-started')) return;
    sessionStorage.setItem('smoke-started', '1');
    const failed = (error) => report({
        ok: false, error: String(error?.message || error), at: location.pathname, page: document.body.innerText.slice(0, 600),
    });
    addEventListener('DOMContentLoaded', () => steps[smoke.step]().then((result) => report({ ok: true, ...result }), failed));
})();
