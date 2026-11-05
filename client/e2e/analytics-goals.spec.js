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
    await expect(dialog.getByRole('heading', { name: 'Which goal should this go under?' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    // Guitar practice is associated with a goal, which starts selected; a level step appears if it has a choice.
    const levelChoice = dialog.getByRole('button', { name: /(Term|Immediate) Goal$/ });
    await expect(levelChoice.or(dialog.locator('#goal-name')).first()).toBeVisible();
    if (await levelChoice.count()) await levelChoice.first().click();
    await dialog.locator('#goal-name').fill(`Practise more ${suffix}`);
    const createdResponse = page.waitForResponse((response) => response.url().endsWith(`/api/${root}/goals`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    expect((await createdResponse).ok()).toBeTruthy();
    await expect(page.getByRole('dialog', { name: `Practise more ${suffix}` })).toBeVisible();

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
        const leverGoal = await call(`${root}/goals`, { name: 'Lever goal', type: 'LongTermGoal', parent_id: root });
        await call(`${root}/activities/${activity.id}/goals`, { goal_ids: [leverGoal.id] });
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
    if (suffix === 'mobile') {
        // A real tap on a phone: no pointer sits over the chart before the touch.
        await page.mouse.move(0, 0);
        await expect(readout).toBeHidden();
        await page.touchscreen.tap(x, y);
    } else {
        await page.mouse.click(x, y);
    }
    await page.getByRole('button', { name: 'Create goal…' }).click();
    const dialog = page.getByRole('dialog');
    // Only the goal on this activity at first; unchecking shows the others.
    const onlyAssociated = dialog.getByLabel('Only goals associated with Front Lever');
    await expect(onlyAssociated).toBeChecked();
    await expect(dialog.getByText('Lever goal', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Axis Room/i)).toHaveCount(0);
    await dialog.getByText('Only goals associated with Front Lever').click();
    await expect(onlyAssociated).not.toBeChecked();
    await expect(dialog.locator('[data-goal-id]')).not.toHaveCount(1);
    await dialog.getByText('Only goals associated with Front Lever').click();
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(dialog).toContainText('Lever goal');
    const level = dialog.getByRole('button', { name: 'Short Term Goal' });
    await expect(level).toBeVisible();
    // A dialog on a phone too, not the full-screen form that follows.
    expect((await dialog.boundingBox()).height).toBeLessThan(page.viewportSize().height * 0.75);
    await level.click();
    const goalName = `Hold it better ${suffix}`;
    await dialog.locator('#goal-name').fill(goalName);
    const created = page.waitForResponse((response) => response.url().endsWith(`/api/${root}/goals`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    expect((await created).ok()).toBeTruthy();

    // The goal opens on the open saved view itself, not a copy, with the goal marked on it.
    const details = page.getByRole('dialog', { name: goalName });
    const goalCharts = details.getByRole('region', { name: 'Analytics' });
    await expect(goalCharts.getByText('1 of 2', { exact: true })).toBeVisible();
    await expect(goalCharts.getByText(viewName, { exact: true })).toBeVisible();
    await expect(goalCharts.getByTitle(new RegExp(`^${goalName} \\(`))).toBeVisible();
    const views = await page.evaluate(async ({ root, token }) => (await (await fetch(
        `/api/roots/${root}/dashboards`, { headers: { Authorization: `Bearer ${token}` } },
    )).json()).data.map((view) => view.name), { root, token });
    expect(views).toEqual([viewName]);

    // Its tag picker opens above this modal (click checks nothing covers it).
    // The toast sits over the footer on a phone, and holds while the test's pointer rests on it.
    await page.mouse.move(0, 0);
    await expect(page.getByRole('status').filter({ hasText: 'Goal created' })).toHaveCount(0, { timeout: 10_000 });
    await details.getByRole('button', { name: 'Edit', exact: true }).click();
    await details.getByText('Only count when tagged').click();
    await details.getByRole('button', { name: 'Add tag' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose required tags' });
    await picker.getByPlaceholder('Create a tag').click();
    await picker.getByRole('button', { name: 'Close tag picker' }).click();
    await expect(picker).toHaveCount(0);
    await details.getByRole('button', { name: 'Cancel', exact: true }).click();
    await details.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(details).toHaveCount(0);

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

test('a goal from an unsaved chart gets that chart, saved under its name and shown first', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const root = `browser-root-${suffix}`;
    const headers = { Authorization: `Bearer ${await logIn(page)}` };

    await page.goto(`/${root}/analytics`);
    await page.getByRole('button', { name: /^Activities/ }).first().click();
    await page.getByRole('button', { name: /Activity Totals/ }).first().click();
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    await page.getByRole('button', { name: 'Set goal', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
    const box = await canvas.boundingBox();
    const create = page.getByRole('button', { name: 'Create goal…' });
    await expect(async () => {
        if (suffix === 'mobile') await page.touchscreen.tap(box.x + box.width * 0.6, box.y + box.height * 0.5);
        else await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
        await expect(create).toBeVisible({ timeout: 1500 });
    }).toPass();
    await create.click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    const levelChoice = dialog.getByRole('button', { name: /(Term|Immediate) Goal$/ });
    await expect(levelChoice.or(dialog.locator('#goal-name')).first()).toBeVisible();
    if (await levelChoice.count()) await levelChoice.first().click();
    const goalName = `Saved chart goal ${suffix}`;
    await dialog.locator('#goal-name').fill(goalName);
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    const details = page.getByRole('dialog', { name: goalName });
    const goalCharts = details.getByRole('region', { name: 'Analytics' });
    await expect(goalCharts.getByText('1 of 2', { exact: true })).toBeVisible();
    await expect(goalCharts.getByText(goalName, { exact: true })).toBeVisible();
    await goalCharts.getByRole('button', { name: 'Next chart' }).click();
    await expect(goalCharts.getByTitle(/^Progress toward/)).toBeVisible();

    // The page behind stays as it was: not switched to the new view.
    await details.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(details).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Empty Analytics View' })).toBeVisible();
    const views = (await (await page.request.get(`/api/roots/${root}/dashboards`, { headers })).json()).data;
    expect(views.find((view) => view.name === goalName)).toMatchObject({ kind: 'view' });
});

test('a saved view of the removed Goal Detail View goes back to choosing a chart', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const root = `browser-root-${suffix}`;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const headers = { Authorization: `Bearer ${await logIn(page)}` };
    const name = `Old goal detail ${suffix}`;
    const created = await page.request.post(`/api/roots/${root}/dashboards`, { headers, data: {
        name, kind: 'view', layout: {
            type: 'analytics_view', version: 1, global_filters: {},
            profile: { selectedCategory: 'goals', selectedVisualization: 'goalDetail' },
        },
    } });
    expect(created.ok()).toBeTruthy();

    await page.goto(`/${root}/analytics`);
    await page.getByRole('button', { name: 'Saved Analytics' }).click();
    await page.getByRole('button', { name: `Open ${name}` }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByRole('button', { name: /Summary Stats/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Goal Detail View/ })).toHaveCount(0);
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('Metric Trends offers Set goal with one metric showing, and not with two', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const root = `browser-axis-room-root-${suffix}`;
    const token = await logIn(page);
    const seed = await page.evaluate(async ({ token, root }) => {
        const call = async (path, body, method = 'POST') => {
            const response = await fetch(`/api/${path}`, {
                method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
            return response.json();
        };
        const activity = await call(`${root}/activities`, { name: 'Trend press', has_metrics: true, metrics: [
            { name: 'Load', unit: 'Lbs', input_type: 'number' },
            { name: 'Count', unit: 'Reps', input_type: 'number' },
        ] });
        const [load, count] = activity.metric_definitions;
        for (const [loadValue, countValue] of [[40, 5], [60, 7]]) {
            const session = await call(`${root}/sessions`, { name: 'Press practice', goal_ids: [root], session_data: {
                sections: [{ name: 'Practice', items: [{ type: 'activity', activity_definition_id: activity.id }] }],
            } });
            const instances = await (await fetch(`/api/${root}/sessions/${session.id}/activities`, { headers: { Authorization: `Bearer ${token}` } })).json();
            await call(`${root}/sessions/${session.id}/activities/${instances[0].id}/metrics`, { metrics: [
                { metric_id: load.id, value: loadValue }, { metric_id: count.id, value: countValue },
            ] }, 'PUT');
            await call(`${root}/activity-instances/${instances[0].id}/complete`, {});
            await call(`${root}/sessions/${session.id}`, { completed: true }, 'PUT');
        }
        const view = (name, metrics) => call(`roots/${root}/dashboards`, { name, kind: 'view', layout: {
            type: 'analytics_view', version: 1, global_filters: {},
            profile: {
                selectedCategory: 'activities', selectedVisualization: 'metricTrends',
                selectedActivity: { id: activity.id, name: activity.name },
                visualizationState: { metrics },
            },
        } });
        await view('Press both', [load.id, count.id]);
        await view('Press load', [load.id]);
        await view('Press yield', ['yield']);
        return { name: activity.name };
    }, { token, root });
    expect(seed.name).toBe('Trend press');

    const open = async (name) => {
        await page.goto(`/${root}/analytics`);
        await page.getByRole('button', { name: 'Saved Analytics' }).click();
        await page.getByRole('button', { name: `Open ${name}` }).click();
        await expect(page.locator('canvas').first()).toBeVisible();
    };
    const setGoal = page.getByRole('button', { name: 'Set goal', exact: true });
    await open('Press both');
    await expect(setGoal).toHaveCount(0);
    await open('Press load');
    await expect(setGoal).toBeVisible();

    // The Yield line reads as a goal too, with the crosshair on its axis.
    await open('Press yield');
    await setGoal.click();
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
    const box = await page.locator('canvas').first().boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
    await expect(page.getByText(/^Total yield ≥ \d+ within one session$/)).toBeVisible();

    // It saves as a real goal, marked on the Yield line.
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
    await page.getByRole('button', { name: 'Create goal…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await dialog.getByRole('button', { name: 'Short Term Goal' }).click();
    const goalName = `Yield goal ${suffix}`;
    await dialog.locator('#goal-name').fill(goalName);
    const created = page.waitForResponse((response) => response.url().endsWith(`/api/${root}/goals`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    expect((await created).ok()).toBeTruthy();
    const goalCharts = page.getByRole('dialog', { name: goalName }).getByRole('region', { name: 'Analytics' });
    await expect(goalCharts.getByTitle(new RegExp(`^${goalName} \\(`))).toBeVisible();
});

