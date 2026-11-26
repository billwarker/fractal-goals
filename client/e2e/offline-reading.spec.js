import { expect, test } from '@playwright/test';

import { apiToken, openOrigin } from './support/session.js';

test('screens opened before losing signal are readable after an offline restart', async ({ page, context, browserName }, testInfo) => {
    test.skip(browserName === 'webkit', 'Playwright’s WebKit cannot reload a page offline through a service worker.');
    test.skip(testInfo.project.name === 'mobile', 'The stored reads are the same on every viewport.');
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openOrigin(page);
    const root = `browser-offline-root-${testInfo.project.name}`;
    const headers = { Authorization: `Bearer ${apiToken()}` };
    const goalName = `Readable offline ${Date.now()}`;
    const noteText = `Offline note ${Date.now()}`;
    for (const [path, data] of [
        ['goals', { name: goalName, type: 'LongTermGoal', parent_id: root }],
        ['notes', { content: noteText, context_type: 'root', context_id: root }],
    ]) {
        const response = await page.request.post(`/api/${root}/${path}`, { headers, data });
        expect(response.ok(), await response.text()).toBe(true);
    }

    await page.goto(`/${root}/notes`);
    await expect(page.getByText(noteText).first()).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Stored once the sync engine has loaded, which a full page load here could otherwise beat.
    await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
        const open = indexedDB.open('fractal-offline-kv');
        open.onsuccess = () => {
            const keys = open.result.transaction('kv').objectStore('kv').getAllKeys();
            keys.onsuccess = () => {
                open.result.close();
                resolve(keys.result.some((key) => String(key).includes('all-notes') && !String(key).includes('heatmap')));
            };
        };
    }))).toBe(true);
    await page.goto(`/${root}/goals`);
    await expect(page.getByText(goalName).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(goalName).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.waitForTimeout(1500);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText(goalName).first()).toBeVisible({ timeout: 20_000 });
    await page.goto(`/${root}/notes`);
    await expect(page.getByText(noteText).first()).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
});

test('a delete tried offline fails at once and is never sent later', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'The same on every viewport.');
    test.setTimeout(60_000);
    await openOrigin(page);
    const root = `browser-offline-root-${testInfo.project.name}`;
    const headers = { Authorization: `Bearer ${apiToken()}` };
    const name = `Keep me ${Date.now()}`;
    const goal = await (await page.request.post(`/api/${root}/goals`, {
        headers, data: { name, type: 'LongTermGoal', parent_id: root },
    })).json();
    await page.goto(`/${root}/goals?goal=${goal.id}`);
    await page.getByRole('button', { name: 'Options', exact: true }).click();
    await page.getByRole('button', { name: /Delete Goal/ }).click();
    await context.setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
    await page.getByRole('button', { name: /Delete Goal/ }).click();
    await expect(page.getByText(/Failed to delete/).first()).toBeVisible();
    const deletes = [];
    page.on('request', (request) => request.method() === 'DELETE' && deletes.push(request.url()));
    await context.setOffline(false);
    await page.waitForTimeout(5000);
    expect(deletes).toEqual([]);
    expect((await page.request.get(`/api/${root}/goals/${goal.id}`, { headers })).ok()).toBe(true);
});

test('a goal edited offline survives a restart, and merges with another device’s edit', async ({ page, context, playwright, baseURL, browserName }, testInfo) => {
    test.skip(browserName === 'webkit', 'Playwright’s WebKit cannot reload a page offline through a service worker.');
    test.skip(testInfo.project.name === 'mobile', 'The queue is the same on every viewport.');
    test.setTimeout(120_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openOrigin(page);
    const root = `browser-offline-root-${testInfo.project.name}`;
    const headers = { Authorization: `Bearer ${apiToken()}` };
    // Another device: its own connection, unaffected by this page going offline.
    const other = await playwright.request.newContext({ baseURL, extraHTTPHeaders: headers });
    const suffix = Date.now();
    const created = await other.post(`/api/${root}/goals`, {
        data: { name: `Before ${suffix}`, description: 'Original', type: 'LongTermGoal', parent_id: root },
    });
    const goal = await created.json();
    const goalUrl = `/${root}/goals?goal=${goal.id}`;

    await page.goto(goalUrl);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Opening a goal from its link uses the link up, so it is opened again.
    await page.goto(goalUrl);
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.waitForTimeout(1500);

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const nameInput = page.locator(`input[value="Before ${suffix}"]`);
    await nameInput.fill(`Phone ${suffix}`);
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await expect(page.getByRole('status').filter({ hasText: 'saved on this device' })).toBeVisible();
    await page.reload();
    await expect(page.getByText(`Phone ${suffix}`).first()).toBeVisible({ timeout: 20_000 });

    const elsewhere = await other.put(`/api/${root}/goals/${goal.id}`, { data: { description: 'From the Mac' } });
    expect(elsewhere.ok()).toBe(true);
    await context.setOffline(false);
    await expect.poll(async () => {
        const { name, description } = await (await other.get(`/api/${root}/goals/${goal.id}`)).json();
        return [name, description];
    }, { timeout: 40_000 }).toEqual([`Phone ${suffix}`, 'From the Mac']);
    expect(errors).toEqual([]);
    await other.dispose();
});

test('an activity made with no signal reaches the server as the device knew it', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'The same on every viewport.');
    test.setTimeout(60_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const root = `browser-offline-root-${testInfo.project.name}`;
    const headers = { Authorization: `Bearer ${apiToken()}` };
    const name = `Made offline ${Date.now()}`;
    await page.goto(`/${root}/manage-activities`);
    await page.waitForLoadState('networkidle');
    // Opened once, so its code is here.
    await page.getByRole('button', { name: /create/i }).first().click();
    await page.getByRole('menuitem', { name: /activity$/i }).first().click();
    await page.waitForLoadState('networkidle');
    await context.setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
    await page.getByLabel('Activity Name').fill(name);
    await page.getByRole('button', { name: 'Create Activity' }).last().click();
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'saved on this device' })).toBeVisible();

    await context.setOffline(false);
    await expect.poll(async () => {
        const list = await (await page.request.get(`/api/${root}/activities`, { headers })).json();
        return list.filter((activity) => activity.name === name).length;
    }, { timeout: 30_000 }).toBe(1);
    await expect(page.getByText(name)).toHaveCount(1);
    expect(errors).toEqual([]);
});
