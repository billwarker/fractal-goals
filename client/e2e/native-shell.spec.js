import { expect, test } from '@playwright/test';

import { BROWSER_USER, apiToken } from './support/session.js';

// The same build in a pretend Mac shell: no cookies, a secret store, and the real device sign-in.
test.use({ storageState: { cookies: [], origins: [] } });

async function openShell(page, baseURL) {
    const secrets = new Map();
    const calls = [];
    await page.exposeFunction('__shellInvoke', (command, args = {}) => {
        calls.push([command, args]);
        if (command === 'secret_get') return secrets.get(args.key) ?? null;
        if (command === 'secret_set') secrets.set(args.key, args.value);
        if (command === 'secret_delete') secrets.delete(args.key);
        return null;
    });
    await page.addInitScript((apiUrl) => {
        globalThis.__FRACTAL_SHELL__ = {
            platform: 'macos', build: 1, apiUrl, appUrl: 'https://my.fractalgoals.com', deviceName: 'Test Mac',
            invoke: (command, args) => globalThis.__shellInvoke(command, args),
        };
    }, `${baseURL}/api`);
    return { secrets, calls };
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
    const { secrets } = await openShell(page, baseURL);
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
    expect(devices.map(({ name }) => name)).toContain('Test Mac');

    await page.waitForLoadState('networkidle');
    // Signed out from elsewhere, the app asks to sign in again.
    const mine = devices.find(({ name }) => name === 'Test Mac');
    expect((await page.request.delete(`/api/auth/devices/${mine.id}`, { headers })).ok()).toBe(true);
    await page.goto('/');
    await expect(page.getByText('LOG IN', { exact: true })).toBeVisible();
    expect(secrets.size).toBe(0);
    expect(errors).toEqual([]);
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
