import { expect, test } from '@playwright/test';

import { apiToken, openOrigin } from './support/session.js';

test('screens opened before losing signal are readable after an offline restart', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The stored reads are the same on every viewport.');
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openOrigin(page);
    const root = 'browser-offline-root-desktop';
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

test('a goal edited offline survives a restart, and merges with another device’s edit', async ({ page, context, playwright, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The queue is the same on every viewport.');
    test.setTimeout(120_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openOrigin(page);
    const root = 'browser-offline-root-desktop';
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
