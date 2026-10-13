import { expect, test } from '@playwright/test';

async function logIn(page) {
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    const login = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    const { token } = await (await login).json();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    return token;
}

test('an open session keeps working with no signal, survives a reload, and syncs on reconnect', async ({ page, context }, testInfo) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const token = await logIn(page);
    const root = `browser-offline-root-${testInfo.project.name}`;
    const headers = { Authorization: `Bearer ${token}` };

    const definition = await (await page.request.post(`/api/${root}/activities`, {
        headers, data: { name: 'Offline drill', has_metrics: false },
    })).json();
    const session = await (await page.request.post(`/api/${root}/sessions`, {
        headers,
        data: {
            name: 'Dead-zone session',
            goal_ids: [root],
            session_data: { sections: [{ name: 'Main', items: [{ type: 'activity', activity_definition_id: definition.id }] }] },
        },
    })).json();

    await page.goto(`/${root}/session/${session.id}`);
    await expect(page.getByText('Offline drill').first()).toBeVisible();
    // The app shell must be controlled by the worker before signal drops.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.getByText('Offline drill').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.waitForTimeout(1500); // let the session cache persist

    await context.setOffline(true);
    const tappedStart = Date.now();
    await page.getByTitle('Start timer').first().click();
    const sync = page.getByRole('status').filter({ hasText: /Offline|Syncing|synced|saved on this device/ });
    await expect(sync).toContainText('saved on this device');
    await page.waitForTimeout(3000);
    const tappedStop = Date.now();
    await page.getByTitle('Complete activity').first().click();
    await expect(sync).toContainText('2 changes saved on this device');

    // Reopen the page in the dead zone: the shell, the session, and the queue all come back.
    await page.reload();
    await expect(page.getByText('Offline drill').first()).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'saved on this device' })).toContainText('2 changes');

    await context.setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: 'All changes synced' })).toBeVisible({ timeout: 30_000 });

    const instances = await (await page.request.get(`/api/${root}/sessions/${session.id}/activities`, { headers })).json();
    expect(instances).toHaveLength(1);
    const [drill] = instances;
    expect(drill.completed).toBe(true);
    // Recorded when the user tapped, not when signal returned.
    expect(Math.abs(Date.parse(drill.time_start) - tappedStart)).toBeLessThan(3000);
    expect(Math.abs(Date.parse(drill.time_stop) - tappedStop)).toBeLessThan(3000);
    expect(errors).toEqual([]);

    await page.request.delete(`/api/${root}/sessions/${session.id}`, { headers });
});
