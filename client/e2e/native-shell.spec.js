import { expect, test } from '@playwright/test';

import { BROWSER_USER, apiToken } from './support/session.js';

// The same build in a pretend Mac shell: no cookies, a secret store, and the real device sign-in.
test.use({ storageState: { cookies: [], origins: [] } });

async function openShell(page, baseURL, deviceName = 'Other Mac') {
    const secrets = new Map();
    const calls = [];
    const queue = new Map();
    await page.exposeFunction('__shellInvoke', (command, args = {}) => {
        calls.push([command, args]);
        if (command === 'secret_get') return secrets.get(args.key) ?? null;
        if (command === 'secret_set') secrets.set(args.key, args.value);
        if (command === 'secret_delete') secrets.delete(args.key);
        if (command === 'queue_all') return [...queue.values()];
        if (command === 'queue_put') queue.set(args.opId, args.value);
        if (command === 'queue_delete') queue.delete(args.opId);
        return null;
    });
    await page.addInitScript(([apiUrl, name]) => {
        globalThis.__FRACTAL_SHELL__ = {
            platform: 'macos', build: 1, apiUrl, appUrl: 'https://my.fractalgoals.com', deviceName: name,
            invoke: (command, args) => globalThis.__shellInvoke(command, args),
            onMenu: (choose) => {
                globalThis.__chooseFromMenu = choose;
                return () => {};
            },
        };
    }, [`${baseURL}/api`, deviceName]);
    return { secrets, calls, queue };
}

async function signIn(page) {
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill(BROWSER_USER.username);
    await page.getByLabel('Password', { exact: true }).fill(BROWSER_USER.password);
    const answered = page.waitForResponse((response) => response.url().endsWith('/api/auth/token'));
    await page.getByRole('button', { name: /log in/i }).last().click();
    expect((await answered).ok()).toBe(true);
    await expect(page.getByText('New Fractal').first()).toBeVisible();
}

test('a shell signs in as a device, stays signed in, works, and signs out', async ({ page, context, baseURL }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'The Mac app is a desktop layout.');
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const deviceName = `Test Mac ${testInfo.project.name} ${Date.now()}`;
    const { secrets } = await openShell(page, baseURL, deviceName);
    await signIn(page);
    const first = secrets.get('refresh-token');
    expect(first).toBeTruthy();
    expect((await context.cookies()).map(({ name }) => name)).toEqual([]);

    // A restart keeps the session, on a new refresh token.
    await page.reload();
    await expect(page.getByText('New Fractal').first()).toBeVisible();
    expect(secrets.get('refresh-token')).not.toBe(first);

    // Reads and writes work with the bearer token alone.
    const root = 'browser-offline-root-desktop';
    await page.waitForLoadState('networkidle'); // WebKit reports imports a navigation interrupts as errors
    await page.goto(`/${root}/goals`);
    const saved = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((found) => found.length));
    expect(saved).toBe(0);
    const headers = { Authorization: `Bearer ${apiToken()}` };
    const { devices } = await (await page.request.get('/api/auth/devices', { headers })).json();
    expect(devices.map(({ name }) => name)).toContain(deviceName);

    await page.waitForLoadState('networkidle');
    // Signed out from elsewhere, the app asks to sign in again.
    const mine = devices.find(({ name }) => name === deviceName);
    expect((await page.request.delete(`/api/auth/devices/${mine.id}`, { headers })).ok()).toBe(true);
    await page.goto('/');
    await expect(page.getByText('LOG IN', { exact: true })).toBeVisible();
    expect(secrets.size).toBe(0);
    expect(errors).toEqual([]);
});

test('a shell keeps unsent changes in its own file, and sends them after a restart', async ({ page, context, baseURL }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'The Mac app is a desktop layout.');
    test.setTimeout(90_000);
    const { queue } = await openShell(page, baseURL);
    await signIn(page);
    const root = `browser-offline-root-${testInfo.project.name}`;
    const headers = { Authorization: `Bearer ${apiToken()}` };
    const suffix = Date.now();
    const goal = await (await page.request.post(`/api/${root}/goals`, {
        headers, data: { name: `Shell ${suffix}`, type: 'LongTermGoal', parent_id: root },
    })).json();
    await page.waitForLoadState('networkidle');
    await page.goto(`/${root}/goals?goal=${goal.id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.waitForLoadState('networkidle');
    await context.setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
    await page.locator(`input[value="Shell ${suffix}"]`).fill(`Kept ${suffix}`);
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await expect(page.getByRole('status').filter({ hasText: 'saved on this device' })).toBeVisible();
    expect(queue.size).toBe(1);

    // The shell's file outlives everything the web view holds.
    await context.setOffline(false);
    await page.evaluate(async () => {
        for (const { name } of await indexedDB.databases()) indexedDB.deleteDatabase(name);
    });
    await page.reload();
    await expect.poll(async () => (await (await page.request.get(`/api/${root}/goals/${goal.id}`, { headers })).json()).name, {
        timeout: 30_000,
    }).toBe(`Kept ${suffix}`);
    await expect.poll(() => queue.size).toBe(0);
});

test('an outdated shell is told to update', async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'The Mac app is a desktop layout.');
    await openShell(page, baseURL);
    await page.route('**/api/**', (route) => {
        expect(route.request().headers()).toMatchObject({ 'x-client-platform': 'macos', 'x-client-build': '1' });
        return route.fulfill({ status: 426, json: { error: 'Update required', code: 'client_update_required' } });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Update Fractal Goals' })).toBeVisible();
});

test('a shell opens outside links in the system browser', async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'The Mac app is a desktop layout.');
    const { calls } = await openShell(page, baseURL);
    await signIn(page);
    await page.getByRole('button', { name: /settings/i }).first().click();
    await page.getByRole('link', { name: 'Privacy Policy' }).click();
    await expect.poll(() => calls.filter(([command]) => command === 'open_external').map(([, { url }]) => url))
        .toEqual(['https://my.fractalgoals.com/privacy']);
    expect(page.context().pages()).toHaveLength(1);
});

test('the app menus open pages and Settings, and keep the menu bar told', async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'The Mac app is a desktop layout.');
    test.setTimeout(60_000);
    const { calls } = await openShell(page, baseURL);
    await signIn(page);
    const root = `browser-offline-root-${testInfo.project.name}`;
    await page.goto(`/${root}/goals`);
    await page.waitForLoadState('networkidle');
    const choose = (id) => page.evaluate((choice) => globalThis.__chooseFromMenu(choice), id);

    await choose('page:notes');
    await expect(page).toHaveURL(new RegExp(`/${root}/notes$`));
    await choose('settings');
    await expect(page.getByRole('dialog').getByText('Remind me on this Mac')).toBeVisible();
    await page.keyboard.press('Escape');
    await choose('fractals');
    await expect(page).toHaveURL(/\/$/);
    // The fractal last open stays the one the menus lead to.
    await choose('new-session');
    await expect(page).toHaveURL(new RegExp(`/${root}/create-session$`));
    expect(calls.some(([command]) => command === 'set_timer')).toBe(true);
});
