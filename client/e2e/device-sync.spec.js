import { expect, test } from '@playwright/test';

import { apiToken } from './support/session.js';

test('an open page shows what another device just created', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The listener is the same on every viewport.');
    test.setTimeout(60_000);
    const root = 'browser-offline-root-desktop';
    const positioned = page.waitForResponse((response) => response.url().includes('/api/sync/cursor') && response.ok());
    await page.goto(`/${root}/goals`);
    await positioned;

    const name = `From another device ${Date.now()}`;
    const response = await page.request.post(`/api/${root}/goals`, {
        headers: { Authorization: `Bearer ${apiToken()}` },
        data: { name, type: 'LongTermGoal', parent_id: root },
    });
    expect(response.ok(), await response.text()).toBe(true);
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 40_000 });
});

test('an edit being typed survives another device saving the same goal, and both are kept', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The same on every viewport.');
    test.setTimeout(90_000);
    const root = 'browser-offline-root-desktop';
    const headers = { Authorization: `Bearer ${apiToken()}` };
    const suffix = Date.now();
    const goal = await (await page.request.post(`/api/${root}/goals`, {
        headers, data: { name: `Start ${suffix}`, description: 'Original', type: 'LongTermGoal', parent_id: root },
    })).json();
    const positioned = page.waitForResponse((response) => response.url().includes('/api/sync/cursor') && response.ok());
    await page.goto(`/${root}/goals?goal=${goal.id}`);
    await positioned;
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const name = page.locator(`input[value="Start ${suffix}"]`);
    await name.fill(`Typed ${suffix}`);

    const elsewhere = await page.request.put(`/api/${root}/goals/${goal.id}`, { headers, data: { description: 'From the Mac' } });
    expect(elsewhere.ok()).toBe(true);
    // The change has reached this page.
    await page.waitForResponse(async (response) => response.url().includes('/api/sync/changes')
        && (await response.json()).changes.some(({ id }) => id === goal.id), { timeout: 40_000 });
    await page.waitForTimeout(1500);
    await expect(page.locator(`input[value="Typed ${suffix}"]`)).toBeVisible();
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await expect.poll(async () => {
        const saved = await (await page.request.get(`/api/${root}/goals/${goal.id}`, { headers })).json();
        return [saved.name, saved.description];
    }).toEqual([`Typed ${suffix}`, 'From the Mac']);
});
