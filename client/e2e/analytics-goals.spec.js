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
    test.setTimeout(60_000);
    const suffix = testInfo.project.name;
    const root = `browser-trend-goals-root-${suffix}`;
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
        const activity = await call(`${root}/activities`, { name: 'Trend press', has_metrics: true, has_sets: true, metrics: [
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
    await expect(page.getByText(/^Top set yield ≥ \d+ within one session$/)).toBeVisible();

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
    const details = page.getByRole('dialog', { name: goalName });
    const goalCharts = details.getByRole('region', { name: 'Analytics' });
    await expect(goalCharts.getByTitle(new RegExp(`^${goalName} \\(`))).toBeVisible();

    // The form shows it as yield per set, and can switch it to the average.
    await page.mouse.move(0, 0);
    await expect(page.getByRole('status').filter({ hasText: 'Goal created' })).toHaveCount(0, { timeout: 10_000 });
    await details.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(details.getByRole('radio', { name: 'Yield per set' })).toBeChecked();
    await details.getByRole('tab', { name: 'Average', exact: true }).click();
    await expect(details.getByText(/average yield ≥ \d+ across at least 1 set within one session/)).toBeVisible();
    const saved = page.waitForResponse((response) => ['PUT', 'PATCH'].includes(response.request().method()) && response.url().includes('/goals/'));
    await details.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await saved).ok()).toBeTruthy();
    await expect(details.getByText(/average yield ≥ \d+ across at least 1 set within one session/)).toBeVisible();
});


test('stacked Metric Trends and Progress panels for one activity line up their x axes', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(testInfo.project.name !== 'desktop', 'Phones show panels without this layout.');
    const root = 'browser-aligned-sessions-root-desktop';
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const token = await logIn(page);
    const dashboardName = await page.evaluate(async ({ token, root }) => {
        const call = async (path, body, method = 'POST') => {
            const response = await fetch(`/api/${path}`, {
                method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
            return response.json();
        };
        const activity = await call(`${root}/activities`, { name: 'Aligned press', has_metrics: true, has_sets: true, metrics: [
            { name: 'Load', unit: 'Lbs', input_type: 'number' },
        ] });
        const [load] = activity.metric_definitions;
        for (const value of [40, 60, 50, 70]) {
            const session = await call(`${root}/sessions`, { name: 'Aligned practice', goal_ids: [root], session_data: {
                sections: [{ name: 'Practice', items: [{ type: 'activity', activity_definition_id: activity.id }] }],
            } });
            const instances = await (await fetch(`/api/${root}/sessions/${session.id}/activities`, { headers: { Authorization: `Bearer ${token}` } })).json();
            await call(`${root}/sessions/${session.id}/activities/${instances[0].id}/metrics`, { metrics: [{ metric_id: load.id, value }] }, 'PUT');
            await call(`${root}/activity-instances/${instances[0].id}/complete`, {});
            await call(`${root}/sessions/${session.id}`, { completed: true }, 'PUT');
        }
        const panelState = (selectedVisualization, visualizationState) => ({
            selectedCategory: 'activities', selectedVisualization,
            selectedActivity: { id: activity.id, name: activity.name }, visualizationState,
        });
        // A goal marker rebuilds the chart once goals load, which must not take it out of the group.
        await call(`${root}/goals`, {
            name: 'Aligned goal', type: 'LongTermGoal', parent_id: root, completion_condition: 'activity_threshold',
            condition: {
                activity_definition_id: activity.id, kind: 'single_session', measure: 'sets', min_sets: 1,
                rules: [{ metric_definition_id: load.id, operator: '>=', value: 90 }],
            },
        });
        const name = 'Aligned board';
        await call(`roots/${root}/dashboards`, { name, kind: 'dashboard', layout: {
            version: 3, selected_window_id: 'window-1', global_filters: {},
            layout: { type: 'grid', panels: [
                { id: 'window-1', x: 0, y: 0, w: 60, h: 18 },
                { id: 'window-2', x: 0, y: 18, w: 60, h: 18 },
            ] },
            layout_bounds: { columns: 60, rows: 36 },
            window_states: {
                'window-1': panelState('metricTrends', { metrics: [load.id] }),
                'window-2': panelState('metricProgress', { metric: load.id }),
            },
        } });
        return name;
    }, { token, root });

    await page.goto(`/${root}/analytics`);
    await page.getByRole('button', { name: 'Saved Analytics' }).click();
    await page.getByRole('button', { name: `Open ${dashboardName}` }).click();
    const canvases = page.locator('canvas');
    await expect(canvases).toHaveCount(2);
    const plots = () => canvases.evaluateAll((items) => items.map((canvas) => canvas.dataset.alignedPlot));
    await expect.poll(async () => {
        const [first, second] = await plots();
        return Boolean(first) && first === second;
    }).toBe(true);
    const [plot] = await plots();
    // Every session has a slot on both, though Progress has no comparison for the first.
    expect(plot.split(':')[2]).toBe('4');

    // The goal has loaded and rebuilt the chart by now, and the rebuilt chart is still aligned.
    await expect(page.getByTitle(/^Aligned goal \(/)).toBeVisible();
    await expect.poll(async () => {
        const [first, second] = await plots();
        return Boolean(first) && first === second;
    }).toBe(true);

    // Hovering one chart moves the crosshair across both, to the same slot.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    const trendsBefore = await canvases.first().evaluate((canvas) => canvas.toDataURL());
    const box = await canvases.nth(1).boundingBox();
    const [plotLeft, plotRight] = plot.split(':').map(Number);
    const grid = await page.locator('[data-page-grid]').boundingBox();
    const slotX = (index) => grid.x + plotLeft + ((plotRight - plotLeft) * (index + 0.5)) / 4;
    await page.mouse.move(slotX(2), box.y + box.height * 0.45);
    await expect.poll(async () => canvases.evaluateAll((items) => items.map((item) => item.dataset.alignedHover))).toEqual(['2', '2']);
    // The other chart really draws it: its line and highlighted point, not just its state.
    await expect.poll(async () => (await canvases.first().evaluate((canvas) => canvas.toDataURL())) !== trendsBefore).toBe(true);
    await page.mouse.move(0, 0);
    await expect.poll(async () => canvases.evaluateAll((items) => items.map((item) => item.dataset.alignedHover ?? null))).toEqual([null, null]);
    const boxes = await canvases.evaluateAll((items) => items.map((canvas) => {
        const { left, top, bottom } = canvas.getBoundingClientRect();
        return { left, top, bottom };
    }));
    expect(Math.abs(boxes[0].left - boxes[1].left)).toBeLessThan(1);
    expect(boxes[0].bottom).toBeLessThanOrEqual(boxes[1].top);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('stacked time-bucket charts share their x axis, and side-by-side panels of one metric their y axis', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(testInfo.project.name !== 'desktop', 'Phones show panels without this layout.');
    const root = 'browser-aligned-boards-root-desktop';
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const token = await logIn(page);
    await page.evaluate(async ({ token, root }) => {
        const call = async (path, body, method = 'POST') => {
            const response = await fetch(`/api/${path}`, {
                method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
            return response.json();
        };
        const metric = await call(`${root}/fractal-metrics`, { name: 'Shared load', unit: 'Lbs', input_type: 'number' });
        const activityWith = async (name, values) => {
            const activity = await call(`${root}/activities`, { name, has_metrics: true, has_sets: true, metrics: [
                { name: 'Shared load', unit: 'Lbs', input_type: 'number', fractal_metric_id: metric.id },
            ] });
            const [load] = activity.metric_definitions;
            for (const value of values) {
                const session = await call(`${root}/sessions`, { name: `${name} practice`, goal_ids: [root], session_data: {
                    sections: [{ name: 'Practice', items: [{ type: 'activity', activity_definition_id: activity.id }] }],
                } });
                const instances = await (await fetch(`/api/${root}/sessions/${session.id}/activities`, { headers: { Authorization: `Bearer ${token}` } })).json();
                await call(`${root}/sessions/${session.id}/activities/${instances[0].id}/metrics`, { metrics: [{ metric_id: load.id, value }] }, 'PUT');
                await call(`${root}/activity-instances/${instances[0].id}/complete`, {});
                await call(`${root}/sessions/${session.id}`, { completed: true }, 'PUT');
            }
            return { activity, load };
        };
        const heavy = await activityWith('Heavy press', [200, 240]);
        const light = await activityWith('Light press', [40, 60]);
        const trends = ({ activity, load }) => ({
            selectedCategory: 'activities', selectedVisualization: 'metricTrends',
            selectedActivity: { id: activity.id, name: activity.name }, visualizationState: { metrics: [load.id] },
        });
        const dashboard = (name, panels, windowStates) => call(`roots/${root}/dashboards`, { name, kind: 'dashboard', layout: {
            version: 3, selected_window_id: 'window-1', global_filters: {},
            layout: { type: 'grid', panels }, layout_bounds: { columns: 60, rows: 36 }, window_states: windowStates,
        } });
        await dashboard('Buckets board', [
            { id: 'window-1', x: 0, y: 0, w: 60, h: 18 }, { id: 'window-2', x: 0, y: 18, w: 60, h: 18 },
        ], {
            'window-1': { selectedCategory: 'sessions', selectedVisualization: 'sessionTrends', visualizationState: { grain: 'day' } },
            'window-2': { selectedCategory: 'activities', selectedVisualization: 'activityTrends', visualizationState: { grain: 'day' } },
        });
        await dashboard('Beside board', [
            { id: 'window-1', x: 0, y: 0, w: 30, h: 36 }, { id: 'window-2', x: 30, y: 0, w: 30, h: 36 },
        ], { 'window-1': trends(heavy), 'window-2': trends(light) });
    }, { token, root });

    const open = async (name) => {
        await page.goto(`/${root}/analytics`);
        await page.getByRole('button', { name: 'Saved Analytics' }).click();
        await page.getByRole('button', { name: `Open ${name}` }).click();
        await expect(page.locator('canvas')).toHaveCount(2);
    };
    const settledOn = async (attribute) => {
        const canvases = page.locator('canvas');
        await expect.poll(async () => {
            const [first, second] = await canvases.evaluateAll((items, key) => items.map((item) => item.dataset[key]), attribute);
            return Boolean(first) && first === second;
        }).toBe(true);
        return canvases.first().evaluate((item, key) => item.dataset[key], attribute);
    };

    await open('Buckets board');
    await settledOn('alignedPlot');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);

    await open('Beside board');
    const rows = await settledOn('alignedRows');
    const [, , min, max] = rows.split(':').map(Number);
    // Both hold the heavy activity's 240 and the light one's 40.
    expect(min).toBeLessThanOrEqual(40);
    expect(max).toBeGreaterThanOrEqual(240);
    await expect(page.locator('canvas')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('a goal can be set from an expanded Progress chart on a session', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(testInfo.project.name !== 'desktop', 'The pane stays open beside the session on desktop.');
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const token = await logIn(page);
    const root = 'browser-progress-goals-root-desktop';
    const headers = { Authorization: `Bearer ${token}` };
    const api = async (method, path, data) => {
        const response = await page.request[method](`/api/${root}/${path}`, { headers, data });
        expect(response.ok(), `${path}: ${response.status()}`).toBe(true);
        return response.json();
    };
    const activity = await api('post', 'activities', {
        name: 'Progress press', has_metrics: true, metrics: [{ name: 'Press load', unit: 'Lbs', input_type: 'number' }],
    });
    const metricId = activity.metric_definitions[0].id;
    const sessionWith = (name) => api('post', 'sessions', {
        name, goal_ids: [root],
        session_data: { sections: [{ name: 'Main', items: [{ type: 'activity', activity_definition_id: activity.id }] }] },
    });
    for (const value of [40, 60]) {
        const past = await sessionWith(`Earlier ${value}`);
        const [instance] = await api('get', `sessions/${past.id}/activities`);
        await api('put', `sessions/${past.id}/activities/${instance.id}/metrics`, { metrics: [{ metric_id: metricId, value }] });
        await api('post', `activity-instances/${instance.id}/complete`, {});
        await api('put', `sessions/${past.id}`, { completed: true });
    }
    const session = await sessionWith('Today');

    await page.goto(`/${root}/session/${session.id}`);
    await page.getByRole('tab', { name: 'Progress', exact: true }).click();
    await page.getByLabel('Press load', { exact: true }).focus();
    await page.getByRole('button', { name: /Expand chart$/ }).first().click();
    const expanded = page.getByTestId('expanded-progress-chart');
    await expect(expanded.locator('canvas')).toBeVisible();

    await expanded.getByRole('button', { name: 'Set goal', exact: true }).click();
    await expect(expanded.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
    // Escape leaves the mode, not the chart.
    await page.keyboard.press('Escape');
    await expect(expanded.getByRole('button', { name: 'Set goal', exact: true })).toBeVisible();
    await expanded.getByRole('button', { name: 'Set goal', exact: true }).click();

    const box = await expanded.locator('canvas').boundingBox();
    const x = box.x + box.width * 0.5;
    const y = box.y + box.height * 0.3;
    await page.mouse.move(x, y);
    await expect(page.getByText(/^Press load ≥ .+ within one session$/)).toBeVisible();
    await page.mouse.click(x, y);
    await page.getByRole('button', { name: 'Create goal…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await dialog.getByRole('button', { name: 'Short Term Goal' }).click();
    const goalName = 'Goal from progress';
    await dialog.locator('#goal-name').fill(goalName);
    const created = page.waitForResponse((response) => response.url().endsWith(`/api/${root}/goals`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const goal = await (await created).json();
    expect(goal.condition.rules[0].metric_definition_id).toBe(metricId);

    // It opens on this chart, saved under its name and marked at the threshold.
    const details = page.getByRole('dialog', { name: goalName });
    const goalCharts = details.getByRole('region', { name: 'Analytics' });
    await expect(goalCharts.getByText(goalName, { exact: true })).toBeVisible();
    await expect(goalCharts.getByTitle(new RegExp(`^${goalName} \\(`))).toBeVisible();
    await details.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(expanded).toBeVisible();
    expect(errors).toEqual([]);
});

test('a goal’s progress chart marks the goal and sets new ones', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(testInfo.project.name !== 'desktop', 'The pane stays open beside the session on desktop.');
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const token = await logIn(page);
    const root = 'browser-progress-goal-chart-root-desktop';
    const headers = { Authorization: `Bearer ${token}` };
    const api = async (method, path, data) => {
        const response = await page.request[method](`/api/${root}/${path}`, { headers, data });
        expect(response.ok(), `${path}: ${response.status()}`).toBe(true);
        return response.json();
    };
    const activity = await api('post', 'activities', {
        name: 'Goal chart hold', has_metrics: true, metrics: [{ name: 'Hold rating', unit: 'Rating', input_type: 'number' }],
    });
    const metricId = activity.metric_definitions[0].id;
    // Another goal at the same threshold; the newest, Hold nine, is the chart's goal.
    await api('post', 'goals', {
        name: 'Also nine', type: 'ImmediateGoal', parent_id: root, completion_condition: 'activity_threshold',
        condition: {
            activity_definition_id: activity.id, kind: 'single_session', measure: 'sets', min_sets: 1,
            rules: [{ metric_definition_id: metricId, operator: '>=', value: 9 }],
        },
    });
    await api('post', 'goals', {
        name: 'Hold nine', type: 'LongTermGoal', parent_id: root, completion_condition: 'activity_threshold',
        condition: {
            activity_definition_id: activity.id, kind: 'single_session', measure: 'sets', min_sets: 1,
            rules: [{ metric_definition_id: metricId, operator: '>=', value: 9 }],
        },
    });
    const sessionWith = (name) => api('post', 'sessions', {
        name, goal_ids: [root],
        session_data: { sections: [{ name: 'Main', items: [{ type: 'activity', activity_definition_id: activity.id }] }] },
    });
    for (const value of [4, 6]) {
        const past = await sessionWith(`Earlier ${value}`);
        const [instance] = await api('get', `sessions/${past.id}/activities`);
        await api('put', `sessions/${past.id}/activities/${instance.id}/metrics`, { metrics: [{ metric_id: metricId, value }] });
        await api('post', `activity-instances/${instance.id}/complete`, {});
        await api('put', `sessions/${past.id}`, { completed: true });
    }
    const session = await sessionWith('Today');

    await page.goto(`/${root}/session/${session.id}`);
    await page.getByRole('tab', { name: 'Progress', exact: true }).click();
    await page.getByRole('button', { name: /Expand chart$/ }).first().click();
    const expanded = page.getByTestId('expanded-progress-chart');
    await expect(expanded.getByRole('heading', { name: /Goal: Hold nine/ })).toBeVisible();
    await expect(expanded.locator('canvas')).toBeVisible();
    const marker = expanded.getByRole('button', { name: /^Open goal Hold nine \(≥ 9\)$/ });
    await expect(marker).toBeVisible();
    // The page grid can leave less room right of the plot than the icon is wide; it keeps its size.
    const widthWithLittleRoom = await marker.evaluate((element) => {
        const { left } = element.style;
        element.style.left = `${element.parentElement.clientWidth - 12}px`;
        const { width } = element.getBoundingClientRect();
        element.style.left = left;
        return width;
    });
    expect(widthWithLittleRoom).toBe(24);

    // Both show, side by side, with this chart's goal at the end of the line.
    const other = await expanded.getByRole('button', { name: /^Open goal Also nine \(≥ 9\)$/ }).boundingBox();
    const own = await marker.boundingBox();
    expect(other.x + other.width).toBeLessThanOrEqual(own.x);
    expect(other.y).toBe(own.y);

    await expanded.getByRole('button', { name: 'Set goal', exact: true }).click();
    const box = await expanded.locator('canvas').boundingBox();
    const x = box.x + box.width * 0.5;
    const y = box.y + box.height * 0.5;
    await page.mouse.move(x, y);
    await expect(page.getByText(/^Hold rating ≥ .+ within one session$/)).toBeVisible();
    await page.mouse.click(x, y);
    await page.getByRole('button', { name: 'Create goal…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await dialog.getByRole('button', { name: 'Short Term Goal' }).click();
    const goalName = 'Goal from goal chart';
    await dialog.locator('#goal-name').fill(goalName);
    const created = page.waitForResponse((response) => response.url().endsWith(`/api/${root}/goals`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const goal = await (await created).json();
    expect(goal.condition.rules[0].metric_definition_id).toBe(metricId);

    // Saved as a trend of this metric, marked at its threshold.
    const details = page.getByRole('dialog', { name: goalName });
    const goalCharts = details.getByRole('region', { name: 'Analytics' });
    await expect(goalCharts.getByTitle(new RegExp(`^${goalName} \\(`))).toBeVisible();
    await details.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(expanded.getByRole('button', { name: new RegExp(`^Open goal ${goalName} `) })).toBeVisible();
    expect(errors).toEqual([]);
});
