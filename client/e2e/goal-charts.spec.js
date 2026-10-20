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

async function saveView(page, headers, root, name) {
    const existing = await (await page.request.get(`/api/roots/${root}/dashboards`, { headers })).json();
    for (const view of (existing.data || []).filter((item) => item.name === name)) {
        await page.request.delete(`/api/roots/${root}/dashboards/${view.id}`, { headers });
    }
    const created = await page.request.post(`/api/roots/${root}/dashboards`, {
        headers,
        data: {
            name,
            kind: 'view',
            layout: {
                type: 'analytics_view',
                version: 1,
                profile: { selectedCategory: 'activities', selectedVisualization: 'activityFrequency' },
                global_filters: {},
            },
        },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    return (await created.json()).data.id;
}

// "Heatmap Guitar" is an activity-threshold goal (20 Guitar practice sessions) with four sessions.
test('a saved view shows on a goal beside its threshold chart, expands inline, and leaves on delete', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const root = `browser-root-${suffix}`;
    const goalName = `Heatmap Guitar ${suffix}`;
    const viewName = `Guitar totals ${suffix}`;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const headers = { Authorization: `Bearer ${await logIn(page)}` };
    const viewId = await saveView(page, headers, root, viewName);

    // Analytics: open the saved view and add it to the goal.
    await page.goto(`/${root}/analytics`);
    await page.getByRole('button', { name: 'Saved Analytics' }).click();
    await page.getByRole('button', { name: new RegExp(viewName) }).click();
    await page.getByRole('button', { name: 'Add to goal…' }).click();
    const picker = page.getByRole('dialog', { name: new RegExp(viewName) });
    await picker.getByLabel(`Select ${goalName}`).click();
    await picker.getByRole('button', { name: 'Save' }).click();
    await expect(picker).toHaveCount(0);
    const viewGoals = await (await page.request.get(`/api/roots/${root}/dashboards/${viewId}/goals`, { headers })).json();
    expect(viewGoals.goals.map((goal) => goal.goal_name)).toEqual([goalName]);

    // Goal details: the threshold chart first, then the view; compact, cycled with the arrows.
    await page.evaluate(() => localStorage.clear());
    await page.goto(`/${root}/goals`);
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Tree', exact: true }).click();
    const charts = page.getByRole('region', { name: 'Analytics' });
    await expect(async () => {
        await page.locator('.react-flow__node').filter({ hasText: goalName }).getByText(goalName, { exact: true }).click();
        await expect(charts).toBeVisible({ timeout: 2000 });
    }).toPass();
    await expect(charts.getByText('1 of 2', { exact: true })).toBeVisible();
    await expect(charts.getByTitle(/^Progress toward Heatmap Guitar/)).toBeVisible();
    // Nothing in the goal's active period yet, matching its 0 / 20 progress.
    await expect(charts.getByText('No contributing sessions yet.')).toBeVisible();
    await charts.getByRole('button', { name: 'Next chart' }).click();
    await expect(charts.getByText(viewName, { exact: true })).toBeVisible();
    await expect(charts.getByText('2 of 2', { exact: true })).toBeVisible();
    await expect(charts.locator('[data-density="compact"] canvas')).toBeVisible();

    // Expand: the chart replaces the flow tree and its controls, at full detail on the page grid.
    await charts.getByRole('button', { name: 'Expand' }).click();
    const expanded = page.getByTestId('expanded-goal-chart');
    await expect(expanded).toBeVisible();
    await expect(expanded.locator('[data-density="expanded"] canvas')).toBeVisible();
    await expect(expanded.getByRole('heading', { name: viewName })).toBeVisible();
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
    await expect(page.locator('.flowtree-options-pane')).toHaveCount(0);
    await expect(expanded.getByRole('button', { name: /Add chart/ })).toHaveCount(0);
    await expect(expanded.getByRole('tab')).toHaveCount(0);
    const offsets = await expanded.evaluate((element) => {
        const container = element.closest('.content-container');
        const grid = container.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        const size = parseFloat(getComputedStyle(container).backgroundSize) || 20;
        return { x: (box.left - grid.left) % size, y: (box.top - grid.top) % size, size, background: getComputedStyle(element).backgroundColor };
    });
    for (const offset of [offsets.x, offsets.y]) expect(Math.min(offset, offsets.size - offset)).toBeLessThan(1.5);
    expect(offsets.background).toBe('rgba(0, 0, 0, 0)');

    if (suffix === 'mobile') {
        await expect(page.getByRole('dialog', { name: goalName })).toHaveCount(0);
        await expanded.getByRole('button', { name: 'Previous chart' }).click();
        await expect(expanded.getByRole('heading', { name: /^Progress toward Heatmap Guitar/ })).toBeVisible();
        await expanded.getByRole('button', { name: 'Back to goal' }).click();
        await expect(page.getByRole('region', { name: 'Analytics' })).toBeVisible();
    } else {
        // The controls stay in goal details, in the chart's place.
        await expect(charts.getByText('Showing in place of the goal tree.')).toBeVisible();
        await charts.getByRole('button', { name: 'Previous chart' }).click();
        await expect(expanded.getByRole('heading', { name: /^Progress toward Heatmap Guitar/ })).toBeVisible();
        await charts.getByRole('button', { name: 'Collapse' }).click();
        await expect(expanded).toHaveCount(0);
        await expect(page.locator('.react-flow__node').filter({ hasText: goalName }).first()).toBeVisible();
        await expect(page.locator('.flowtree-options-pane')).toHaveCount(1);
        await charts.getByRole('button', { name: 'Expand' }).click();
        await expect(expanded).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(expanded).toHaveCount(0);
    }

    // Deleting the view names its goal, and the goal keeps only its threshold chart.
    await page.goto(`/${root}/analytics`);
    await page.getByRole('button', { name: 'Saved Analytics' }).click();
    await page.locator('[class*="viewRow"]').filter({ hasText: viewName }).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText(new RegExp(`shown on 1 goal \\(${goalName}\\)`))).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(async () => {
        const payload = await (await page.request.get(`/api/${root}/goals/browser-heatmap-goal-${suffix}/charts`, { headers })).json();
        return [payload.default_chart, payload.charts.length];
    }).toEqual(['condition_progress', 0]);
    expect(errors).toEqual([]);
});
