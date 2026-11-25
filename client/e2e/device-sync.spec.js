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
