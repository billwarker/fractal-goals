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

// The "browser-root" fractal has four completed "Guitar practice" sessions.
test('right-clicking an Activity Totals bar sets a goal from that point', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Long-press is covered by unit tests; the desktop path exercises the chart reading.');
    const suffix = testInfo.project.name;
    const root = `browser-root-${suffix}`;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const headers = { Authorization: `Bearer ${await logIn(page)}` };

    await page.goto(`/${root}/analytics`);
    await page.getByRole('button', { name: /^Activities/ }).first().click();
    await page.getByRole('button', { name: /Activity Totals/ }).first().click();
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();

    // The single bar spans the chart; right-click within it, past the y-axis labels.
    await expect(async () => {
        await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.5, { button: 'right' });
        await expect(page.getByRole('menuitem', { name: /Set goal here/ })).toBeVisible({ timeout: 1500 });
    }).toPass();
    const item = page.getByRole('menuitem', { name: /Set goal here/ });
    await expect(item).toContainText(/\d+ Guitar practice sessions?/);
    await item.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const levelChoice = dialog.getByRole('button', { name: /Long Term Goal/ });
    if (await levelChoice.count()) await levelChoice.first().click();
    await dialog.getByLabel('Name').fill(`Practise more ${suffix}`);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const goals = await (await page.request.get(`/api/${root}/goals/conditions`, {
        headers, params: { activity_id: `browser-heatmap-activity-${suffix}` },
    })).json();
    const created = goals.goals.find((goal) => goal.goal_name === `Practise more ${suffix}`);
    expect(created.condition).toMatchObject({ kind: 'consistency' });
    expect(created.condition.required_count).toBeGreaterThan(0);
    expect(errors).toEqual([]);
});
