import { expect, test } from '@playwright/test';

test('a deep link starts history immediately and holds its chart through pagination and retry', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const root = `browser-root-${suffix}`;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();

    let releaseActivities;
    let releaseContinuation;
    const activitiesGate = new Promise((resolve) => { releaseActivities = resolve; });
    const continuationGate = new Promise((resolve) => { releaseContinuation = resolve; });
    let requests = 0;
    let recovered = false;
    await page.route(`**/api/${root}/activities`, async (route) => {
        await activitiesGate;
        await route.continue();
    });
    await page.route(`**/api/${root}/sessions/analytics-summary?*`, async (route) => {
        requests += 1;
        const url = new URL(route.request().url());
        expect(url.searchParams.get('limit')).toBe('200');
        if (requests === 1) {
            const response = await route.fetch();
            const data = await response.json();
            await route.fulfill({ response, json: { ...data, session_pagination: { next_offset: 200 } } });
        } else if (!recovered) {
            await continuationGate;
            await route.fulfill({ status: 503, json: { error: 'History temporarily unavailable' } });
        } else {
            expect(url.searchParams.get('session_offset')).toBe('200');
            await route.fulfill({ json: { sessions: [], activity_instances: {}, session_pagination: { next_offset: null } } });
        }
    });

    await page.goto(`/${root}/analytics?activity=browser-heatmap-activity-${suffix}&viz=activityFrequency`);
    // The catalog is still held: fetching history must not depend on applying the link.
    await expect.poll(() => requests).toBe(2);
    await expect(page.locator('canvas')).toHaveCount(0);
    releaseActivities();
    await expect(page.getByRole('status').filter({ hasText: 'Loading full history' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);

    releaseContinuation();
    await expect(page.getByRole('alert')).toContainText('Analytics could not be loaded');
    await expect(page.locator('canvas')).toHaveCount(0);
    const failedRequests = requests;
    recovered = true;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page).not.toHaveURL(/activity=/);
    expect(requests).toBe(failedRequests + 1);
    expect(errors).toEqual([]);
});
