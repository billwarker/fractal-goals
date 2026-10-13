import { expect, test } from '@playwright/test';

test('quick sessions complete every activity through one shared control', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    const login = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    const { token } = await (await login).json();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    const root = `browser-adjustments-root-${testInfo.project.name}`;
    const headers = { Authorization: `Bearer ${token}` };
    const activityResponse = await page.request.post(`/api/${root}/activities`, {
        headers, data: { name: 'Quick Completion Practice', has_metrics: false },
    });
    expect(activityResponse.ok()).toBeTruthy();
    const activity = await activityResponse.json();
    const templateResponse = await page.request.post(`/api/${root}/session-templates`, {
        headers, data: { name: 'Quick Completion Check', template_data: {
            session_type: 'quick', activities: [{ activity_id: activity.id }],
        } },
    });
    expect(templateResponse.ok()).toBeTruthy();
    await page.goto(`/${root}/create-session`);
    const fromTemplate = page.getByText('From Template', { exact: true });
    if (await fromTemplate.isVisible()) await fromTemplate.click();
    await page.getByText('Quick Completion Check', { exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Quick Session · Quick Completion Check' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '✓ Complete', exact: true })).toHaveCount(0);
    const complete = dialog.getByRole('button', { name: '✓ Complete Quick Session', exact: true });
    await expect(complete).toHaveAttribute('aria-pressed', 'false');
    await expect(complete).toHaveAttribute('title', 'Mark Session Complete');
    await expect(dialog.getByText('This activity is completed when you complete the quick session.')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('quick-session-completion.png') });
    const completion = page.waitForResponse((response) => response.url().endsWith('/sessions/quick-complete'));
    await complete.click();
    const response = await completion;
    expect(response.status()).toBe(201);
    const session = await response.json();
    expect(session.completed).toBe(true);
    const instances = await page.request.get(`/api/${root}/sessions/${session.id}/activities`, { headers });
    expect(instances.ok()).toBeTruthy();
    const rows = await instances.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].completed).toBe(true);
    await expect(dialog).not.toBeVisible();
    expect(errors).toEqual([]);
});
