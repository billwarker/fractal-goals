import { expect, test } from '@playwright/test';

test('a saved value moves the Progress chart and its comparison from the one save response', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The pane stays open beside the session on desktop.');
    test.setTimeout(60_000);
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

    const root = 'browser-offline-root-desktop';
    const headers = { Authorization: `Bearer ${token}` };
    const api = async (method, path, data) => {
        const response = await page.request[method](`/api/${root}/${path}`, { headers, data });
        expect(response.ok(), `${path}: ${response.status()}`).toBe(true);
        return response.json();
    };
    const activityWith = (name) => api('post', 'activities', {
        name, has_metrics: true, metrics: [{ name: `${name} reps`, unit: 'reps', input_type: 'number' }],
    });
    const other = await activityWith('Chart warm up');
    const charted = await activityWith('Chart press');
    const metricId = charted.metric_definitions[0].id;
    const sessionWith = (name, definitions) => api('post', 'sessions', {
        name,
        goal_ids: [root],
        session_data: { sections: [{ name: 'Main', items: definitions.map((definition) => ({ type: 'activity', activity_definition_id: definition.id })) }] },
    });

    const past = await sessionWith('Earlier press', [charted]);
    const [pastInstance] = await api('get', `sessions/${past.id}/activities`);
    await api('put', `sessions/${past.id}/activities/${pastInstance.id}/metrics`, { metrics: [{ metric_id: metricId, value: 36 }] });
    await api('post', `activity-instances/${pastInstance.id}/complete`, {});
    await api('put', `sessions/${past.id}`, { completed: true });

    const session = await sessionWith('Today', [other, charted]);
    await page.goto(`/${root}/session/${session.id}`);
    await page.getByRole('tab', { name: 'Progress', exact: true }).click();
    const selector = page.getByLabel('Select Activity');

    // Entering a value selects that activity, so the pane shows what the save will update.
    await page.getByLabel('Chart warm up reps', { exact: true }).focus();
    await expect(selector).toHaveValue(other.id);
    const input = page.getByLabel('Chart press reps', { exact: true });
    await input.focus();
    await expect(selector).toHaveValue(charted.id);
    const chart = page.locator('[class*="progressChart"] canvas').first();
    await expect(chart).toBeVisible();
    await page.waitForLoadState('networkidle');
    const draw = () => chart.evaluate((canvas) => canvas.toDataURL());
    const before = await draw();

    // The chart can only move from the save response itself: series refetches can't get through.
    await page.route('**/progress-series**', (route) => route.abort());
    const card = page.locator('[class*="metricHints"]', { hasText: /last 36|▲/ });
    await expect(card.getByText('(last 36)', { exact: true })).toBeVisible();
    await input.fill('50');
    expect(await draw()).toBe(before); // Nothing moves while typing.
    const saved = page.waitForResponse((response) => response.url().endsWith('/metrics') && response.request().method() === 'PUT');
    await input.press('Tab');
    const payload = await (await saved).json();

    const comparison = payload.progress_comparison.metric_comparisons.find((row) => row.metric_id === metricId);
    expect(comparison.current_value).toBe(50);
    expect(comparison.previous_value).toBe(36);
    await expect.poll(draw).not.toBe(before);
    await expect(card.getByText('(▲38.9%)', { exact: true })).toBeVisible();

    // A reload draws the same point from the server.
    await page.unroute('**/progress-series**');
    const afterSave = await draw();
    await page.reload();
    await page.getByRole('tab', { name: 'Progress', exact: true }).click();
    await page.getByLabel('Select Activity').selectOption(charted.id);
    await expect(page.getByLabel('Chart press reps', { exact: true })).toHaveValue(/^50/);
    await expect(chart).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect.poll(draw).toBe(afterSave);
    expect(errors).toEqual([]);
});
