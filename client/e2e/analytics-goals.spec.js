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
    await dialog.locator('#goal-name').fill(`Practise more ${suffix}`);
    const createdResponse = page.waitForResponse((response) => response.url().endsWith(`/api/${root}/goals`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    expect((await createdResponse).ok()).toBeTruthy();
    await expect(dialog).toHaveCount(0);

    const goals = await (await page.request.get(`/api/${root}/goals/conditions`, {
        headers, params: { activity_id: `browser-heatmap-activity-${suffix}` },
    })).json();
    const created = goals.goals.find((goal) => goal.goal_name === `Practise more ${suffix}`);
    expect(created.condition).toMatchObject({ kind: 'consistency' });
    expect(created.condition.required_count).toBeGreaterThan(0);
    expect(errors).toEqual([]);
});

test('Set goal mode extends the axes for a goal beyond the data, and leaves no trace', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const suffix = testInfo.project.name;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const token = await logIn(page);
    // Its own seeded fractal: sessions can't be created on a root with one in progress.
    const { root, activityId, formId, viewName } = await page.evaluate(async ({ token, suffix }) => {
        const call = async (path, body, method = 'POST') => {
            const response = await fetch(`/api/${path}`, {
                method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
            return response.json();
        };
        const root = `browser-axis-room-root-${suffix}`;
        const activity = await call(`${root}/activities`, { name: 'Front Lever', has_metrics: true, metrics: [
            { name: 'Hold Time', unit: 'Seconds', input_type: 'number' },
            { name: 'Form', unit: 'Rating', input_type: 'number' },
        ] });
        const [hold, form] = activity.metric_definitions;
        for (const [holdValue, formValue] of [[3, 5], [4, 6], [5, 4]]) {
            const session = await call(`${root}/sessions`, { name: 'Lever practice', goal_ids: [root], session_data: {
                sections: [{ name: 'Practice', items: [{ type: 'activity', activity_definition_id: activity.id }] }],
            } });
            const instances = await (await fetch(`/api/${root}/sessions/${session.id}/activities`, { headers: { Authorization: `Bearer ${token}` } })).json();
            await call(`${root}/sessions/${session.id}/activities/${instances[0].id}/metrics`, { metrics: [
                { metric_id: hold.id, value: holdValue }, { metric_id: form.id, value: formValue },
            ] }, 'PUT');
            await call(`${root}/activity-instances/${instances[0].id}/complete`, {});
            await call(`${root}/sessions/${session.id}`, { completed: true }, 'PUT');
        }
        const viewName = 'Lever scatter';
        await call(`roots/${root}/dashboards`, { name: viewName, kind: 'view', layout: {
            type: 'analytics_view', version: 1, global_filters: {},
            profile: { selectedCategory: 'activities', selectedVisualization: 'scatterPlot', selectedActivity: { id: activity.id, name: activity.name } },
        } });
        return { root, activityId: activity.id, formId: form.id, viewName };
    }, { token, suffix });

    await page.goto(`/${root}/analytics`);
    await page.getByRole('button', { name: 'Saved Analytics' }).click();
    await page.getByRole('button', { name: `Open ${viewName}` }).click();
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const save = page.getByRole('button', { name: 'Save', exact: true });

    await page.getByRole('button', { name: 'Set goal', exact: true }).click();
    const extendUp = page.getByRole('button', { name: 'Extend vertical axis up' });
    await expect(extendUp).toBeVisible();
    // A click on a control extends the axis; it doesn't pin a goal.
    await extendUp.click();
    await extendUp.click();
    await expect(page.getByRole('dialog', { name: 'Set a goal from this point' })).toHaveCount(0);
    // One step back still leaves one to undo.
    const pullBack = page.getByRole('button', { name: 'Pull top of vertical axis back down' });
    await pullBack.click();
    await expect(pullBack).toBeVisible();

    // The top of the plot, wherever its title leaves it: well above the data's best form of 6.
    const box = await canvas.boundingBox();
    const x = box.x + box.width * 0.6;
    const readout = page.getByText('Click to set a goal here');
    let y = box.y;
    while (!(await readout.isVisible()) && y < box.y + box.height) {
        y += 8;
        await page.mouse.move(x, y);
    }
    await expect(readout).toBeVisible();
    await page.mouse.click(x, y);
    await page.getByRole('button', { name: 'Create goal…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Short Term Goal' }).click();
    const goalName = `Hold it better ${suffix}`;
    await dialog.locator('#goal-name').fill(goalName);
    const created = page.waitForResponse((response) => response.url().endsWith(`/api/${root}/goals`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    expect((await created).ok()).toBeTruthy();
    await expect(dialog).toHaveCount(0);

    const { goals } = await page.evaluate(async ({ root, activityId, token }) => (await fetch(
        `/api/${root}/goals/conditions?activity_id=${activityId}`, { headers: { Authorization: `Bearer ${token}` } },
    )).json(), { root, activityId, token });
    const rule = goals[0].condition.rules.find((item) => item.metric_definition_id === formId);
    expect(rule.value).toBeGreaterThan(6);

    // Esc leaves the mode. The controls go, the goal still shows on the chart, and nothing needs saving.
    await page.keyboard.press('Escape');
    await expect(extendUp).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Set goal', exact: true })).toBeVisible();
    const marker = page.getByRole('button', { name: new RegExp(`^Open goal ${goalName}`) });
    await expect(marker).toBeVisible();
    const markerBox = await marker.boundingBox();
    const after = await canvas.boundingBox();
    expect(markerBox.y).toBeGreaterThanOrEqual(after.y);
    await expect(save).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('a saved view can be closed, back to an empty view', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    await logIn(page);

    await page.goto(`/browser-root-${suffix}/analytics`);
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /^Activities/ }).first().click();
    await page.getByRole('button', { name: /Activity Totals/ }).first().click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const name = `Closeable ${suffix} ${Date.now()}`;
    await page.getByPlaceholder('Enter a name').fill(name);
    await page.getByRole('button', { name: 'Save View' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();

    await page.getByRole('button', { name: 'Add to goal…' }).click();
    await expect(page.getByRole('dialog').getByTitle('Shows 0 of 12 charts').first()).toHaveText('0/12');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Empty Analytics View' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
});
