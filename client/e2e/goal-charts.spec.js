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

async function saveView(page, headers, root, name, profile = { selectedCategory: 'activities', selectedVisualization: 'activityFrequency' }) {
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
                profile,
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
    await page.getByRole('list', { name: 'Saved analytics' }).getByRole('button', { name: new RegExp(viewName) }).click();
    await page.getByRole('region', { name: `${viewName} preview` }).getByRole('button', { name: 'Open', exact: true }).click();
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
    // The mini chart is a preview: its canvas takes no hover, so no data tooltips.
    expect(await charts.locator('[data-density="compact"] canvas').evaluate((canvas) => getComputedStyle(canvas).pointerEvents)).toBe('none');

    // Clicking the chart expands it: it replaces the flow tree and its controls, at full detail on the page grid.
    await charts.getByRole('button', { name: /^Expand chart:/ }).click();
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
    // Saved Analytics previews the chosen view; its goals are listed and Delete is one of its actions.
    await page.getByRole('list', { name: 'Saved analytics' }).getByRole('button', { name: new RegExp(viewName) }).click();
    const preview = page.getByRole('region', { name: `${viewName} preview` });
    await expect(preview.getByRole('link', { name: goalName })).toBeVisible();
    await preview.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText(new RegExp(`shown on 1 goal \\(${goalName}\\)`))).toBeVisible();
    await page.getByRole('dialog', { name: 'Delete Analytics View', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(async () => {
        const payload = await (await page.request.get(`/api/${root}/goals/browser-heatmap-goal-${suffix}/charts`, { headers })).json();
        return [payload.default_chart, payload.charts.length];
    }).toEqual(['condition_progress', 0]);
    expect(errors).toEqual([]);
});

// Uses its own goal: the saved-view workflow above asserts Heatmap Guitar's exact chart count.
test('a saved session chart can be added from goal details', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const root = `browser-root-${suffix}`;
    const goalName = `Chart Sandbox ${suffix}`;
    const viewName = `Session trends ${suffix}`;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const headers = { Authorization: `Bearer ${await logIn(page)}` };
    const viewId = await saveView(page, headers, root, viewName, { selectedCategory: 'sessions', selectedVisualization: 'sessionTrends' });

    await page.goto(`/${root}/goals`);
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Tree', exact: true }).click();
    const charts = page.getByRole('region', { name: 'Analytics' });
    await expect(async () => {
        await page.locator('.react-flow__node').filter({ hasText: goalName }).getByText(goalName, { exact: true }).click();
        await expect(charts).toBeVisible({ timeout: 2000 });
    }).toPass();
    await charts.getByRole('button', { name: '+ Add chart' }).click();
    await page.getByRole('menuitem', { name: new RegExp(viewName) }).click();
    await expect(charts.getByText(viewName, { exact: true })).toBeVisible();
    await expect(charts.locator('[data-density="compact"] canvas')).toBeVisible();

    await charts.getByRole('button', { name: 'Remove this chart' }).click();
    await expect(charts.getByText(viewName, { exact: true })).toHaveCount(0);
    await page.request.delete(`/api/roots/${root}/dashboards/${viewId}`, { headers });
    expect(errors).toEqual([]);
});

test('saved analytics searches goals, previews one chart, and manages copies and pins', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const root = `browser-root-${suffix}`;
    const name = `Saved browser ${suffix}`;
    const renamed = `${name} renamed`;
    const goalName = `First clean performance`;
    const headers = { Authorization: `Bearer ${await logIn(page)}` };
    const viewId = await saveView(page, headers, root, name);
    const attached = await page.request.put(`/api/roots/${root}/dashboards/${viewId}/goals`, {
        headers, data: { goal_ids: [`browser-heatmap-milestone-${suffix}`] },
    });
    expect(attached.ok(), await attached.text()).toBeTruthy();
    await page.goto(`/${root}/analytics`);
    await page.getByRole('button', { name: 'Saved Analytics' }).click();
    const dialog = page.getByRole('dialog', { name: 'Saved Analytics', exact: true });
    await dialog.getByRole('searchbox').fill(goalName);
    const card = dialog.getByRole('list', { name: 'Saved analytics' }).getByRole('button', { name: new RegExp(name) });
    await expect(card).toBeVisible();
    await card.click();
    let preview = dialog.getByRole('region', { name: `${name} preview` });
    await expect(preview.getByRole('link', { name: goalName })).toBeVisible();
    await expect(dialog.locator('canvas')).toHaveCount(1);
    await preview.getByRole('button', { name: 'Pin', exact: true }).click();
    await expect(preview.getByRole('button', { name: 'Unpin', exact: true })).toBeEnabled();
    await preview.getByRole('button', { name: 'Rename', exact: true }).click();
    await preview.getByRole('textbox', { name: 'Name' }).fill(renamed);
    await preview.getByRole('button', { name: 'Save', exact: true }).click();
    preview = dialog.getByRole('region', { name: `${renamed} preview` });
    await expect(preview).toBeVisible();
    await dialog.getByRole('searchbox').fill(renamed);
    await preview.getByRole('button', { name: 'Duplicate', exact: true }).click();
    const copy = dialog.getByRole('region', { name: `${renamed} (copy) preview` });
    await expect(copy).toBeVisible();
    await expect(copy.getByText('Not on any goal')).toBeVisible();
    await expect(dialog.locator('canvas')).toHaveCount(1);
    const box = await dialog.boundingBox();
    expect(box.width).toBeLessThanOrEqual(page.viewportSize().width);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    const objects = (await (await page.request.get(`/api/roots/${root}/dashboards`, { headers })).json()).data;
    for (const item of objects.filter((item) => item.id === viewId || item.name === `${renamed} (copy)`)) {
        await page.request.delete(`/api/roots/${root}/dashboards/${item.id}`, { headers });
    }
});

test('dashboard sidebar keeps shared scope above independent chart tabs', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const root = `browser-root-${suffix}`;
    const name = `Sidebar tabs ${suffix}`;
    const headers = { Authorization: `Bearer ${await logIn(page)}` };
    const created = await page.request.post(`/api/roots/${root}/dashboards`, { headers, data: {
        name, kind: 'dashboard', layout: { version: 3, layout: { type: 'grid', panels: [
            { id: 'window-1', x: 0, y: 0, w: 48, h: 48 }, { id: 'window-2', x: 48, y: 0, w: 48, h: 48 },
        ] }, window_states: {
            'window-1': { selectedCategory: 'activities', selectedVisualization: 'activityTrends' },
            'window-2': { selectedCategory: 'sessions', selectedVisualization: 'sessionTrends' },
        }, selected_window_id: 'window-1', global_filters: {} },
    } });
    expect(created.ok(), await created.text()).toBeTruthy();
    const id = (await created.json()).data.id;
    const openDashboard = async () => {
        await page.getByRole('button', { name: 'Saved Analytics', exact: true }).click();
        const browser = page.getByRole('dialog', { name: 'Saved Analytics', exact: true });
        await browser.getByRole('searchbox').fill(name);
        await browser.getByRole('list', { name: 'Saved analytics' }).getByRole('button', { name: new RegExp(name) }).click();
        await browser.getByRole('region', { name: `${name} preview` }).getByRole('button', { name: 'Open', exact: true }).click();
    };
    const showSidebar = () => page.getByRole('button', { name: suffix === 'mobile' ? 'Show Sidebar' : 'Show Filters', exact: true }).click();
    await page.goto(`/${root}/analytics`);
    await openDashboard();
    await showSidebar();
    const global = page.getByRole('region', { name: 'Global filters', exact: true });
    const firstTab = page.getByRole('tab', { name: 'Activity Trends, chart 1' });
    const secondTab = page.getByRole('tab', { name: 'Session Trends, chart 2' });
    const first = page.getByRole('tabpanel', { name: 'Activity Trends, chart 1' });
    const second = page.getByRole('tabpanel', { name: 'Session Trends, chart 2' });
    await expect(global.getByRole('heading', { name: 'Time Range' })).toHaveCount(0);
    await expect(global.getByRole('button', { name: 'Show', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(global.getByRole('list', { name: 'Additional filters' })).toHaveCount(0);
    await global.getByRole('button', { name: 'Show', exact: true }).click();
    const addGlobal = global.getByRole('list', { name: 'Additional filters' });
    await addGlobal.getByRole('button', { name: 'Time range', exact: true }).click();
    await expect(global.getByRole('heading', { name: 'Time Range' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Time Range' })).toHaveCount(1);
    await expect(page.getByRole('list', { name: 'Active filters' })).toHaveCount(0);
    const timeInfo = global.getByRole('button', { name: 'View time range filter selections' });
    if (suffix === 'mobile') await timeInfo.click();
    else await timeInfo.hover();
    await expect(page.getByRole('tooltip')).toHaveText('All time');
    await timeInfo.evaluate((element) => element.blur());
    await page.mouse.move(0, 0);
    await global.getByRole('button', { name: '7D', exact: true }).click();
    await expect(global.getByRole('button', { name: 'Clear time range filter' })).toBeEnabled();
    await global.getByRole('button', { name: 'Clear time range filter' }).click();
    await expect(global.getByRole('button', { name: 'Clear time range filter' })).toBeDisabled();
    await expect(addGlobal).toBeVisible();
    await first.getByRole('combobox', { name: 'Group by', exact: true }).selectOption('activity');
    await first.getByRole('list', { name: 'Additional filters' }).getByRole('button', { name: 'Tags', exact: true }).click();
    await first.getByRole('checkbox', { name: 'Exact tag set' }).check();
    await secondTab.click();
    await second.getByRole('combobox', { name: 'Group by', exact: true }).selectOption('template');
    await expect(second.getByRole('checkbox', { name: 'Exact tag set' })).toHaveCount(0);
    await expect(global.getByRole('heading', { name: 'Time Range' })).toBeVisible();
    await expect(first).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('dashboard-sidebar.png') });
    await page.getByRole('button', { name: suffix === 'mobile' ? 'Hide Sidebar' : 'Hide Filters', exact: true }).click();
    const saved = page.waitForResponse((response) => response.url().endsWith(`/dashboards/${id}`) && response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await saved).ok()).toBeTruthy();
    await page.reload();
    await openDashboard();
    await showSidebar();
    await expect(secondTab).toHaveAttribute('aria-selected', 'true');
    await expect(second.getByRole('combobox', { name: 'Group by', exact: true })).toHaveValue('template');
    await firstTab.click();
    await expect(first.getByRole('combobox', { name: 'Group by', exact: true })).toHaveValue('activity');
    await expect(first.getByRole('checkbox', { name: 'Exact tag set' })).toBeChecked();
    await expect(global.getByRole('checkbox', { name: 'Exact tag set' })).toHaveCount(0);
    await page.request.delete(`/api/roots/${root}/dashboards/${id}`, { headers });
});
