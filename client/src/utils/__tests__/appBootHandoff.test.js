import { APP_BOOT_SHELL_ID, BOOT_HANDOFF_FALLBACK_MS, handoffAppBootShell } from '../appBootHandoff';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('handoffAppBootShell', () => {
    let root;

    beforeEach(() => {
        document.body.innerHTML = `<div id="${APP_BOOT_SHELL_ID}"></div><div id="root"></div>`;
        document.documentElement.setAttribute('data-boot-slow', 'true');
        root = document.getElementById('root');
    });

    const shell = () => document.getElementById(APP_BOOT_SHELL_ID);

    it('keeps the boot loader while the app is still empty or inside a loading delay', async () => {
        handoffAppBootShell(root);
        expect(shell()).not.toBeNull();
        root.innerHTML = '<div aria-busy="true" aria-label="Loading…"></div>';
        await flush();
        expect(shell()).not.toBeNull();
    });

    it('hands over to a visible app loading state, which looks the same', async () => {
        handoffAppBootShell(root);
        root.innerHTML = '<div role="status" aria-busy="true">Loading your goals…</div>';
        await flush();
        expect(shell()).toBeNull();
        expect(document.documentElement.hasAttribute('data-boot-slow')).toBe(false);
    });

    it('hands over to real content', async () => {
        handoffAppBootShell(root);
        root.innerHTML = '<main>Goals</main>';
        await flush();
        expect(shell()).toBeNull();
    });

    it('never outlives an app that leaves something marked busy', async () => {
        vi.useFakeTimers();
        handoffAppBootShell(root);
        root.innerHTML = '<main><section aria-busy="true"></section></main>';
        await vi.advanceTimersByTimeAsync(BOOT_HANDOFF_FALLBACK_MS);
        expect(shell()).toBeNull();
        vi.useRealTimers();
    });
});
