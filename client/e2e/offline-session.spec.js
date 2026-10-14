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

test('an open session keeps working with no signal, survives a reload, and syncs on reconnect', async ({ page, context }, testInfo) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const token = await logIn(page);
    const root = `browser-offline-root-${testInfo.project.name}`;
    const headers = { Authorization: `Bearer ${token}` };

    const definition = await (await page.request.post(`/api/${root}/activities`, {
        headers, data: { name: 'Offline drill', has_metrics: false },
    })).json();
    const session = await (await page.request.post(`/api/${root}/sessions`, {
        headers,
        data: {
            name: 'Dead-zone session',
            goal_ids: [root],
            session_data: { sections: [{ name: 'Main', items: [{ type: 'activity', activity_definition_id: definition.id }] }] },
        },
    })).json();

    await page.goto(`/${root}/session/${session.id}`);
    await expect(page.getByText('Offline drill').first()).toBeVisible();
    // The app shell must be controlled by the worker before signal drops.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.getByText('Offline drill').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.waitForTimeout(1500); // let the session cache persist

    await context.setOffline(true);
    const tappedStart = Date.now();
    await page.getByTitle('Start timer').first().click();
    const sync = page.getByRole('status').filter({ hasText: /Offline|Syncing|synced|saved on this device/ });
    await expect(sync).toContainText('saved on this device');
    await page.waitForTimeout(3000);
    const tappedStop = Date.now();
    await page.getByTitle('Complete activity').first().click();
    await expect(sync).toContainText('2 changes saved on this device');

    // Reopen the page in the dead zone: the shell, the session, and the queue all come back.
    await page.reload();
    await expect(page.getByText('Offline drill').first()).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'saved on this device' })).toContainText('2 changes');

    await context.setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: 'All changes synced' })).toBeVisible({ timeout: 30_000 });

    const instances = await (await page.request.get(`/api/${root}/sessions/${session.id}/activities`, { headers })).json();
    expect(instances).toHaveLength(1);
    const [drill] = instances;
    expect(drill.completed).toBe(true);
    // Recorded when the user tapped, not when signal returned.
    expect(Math.abs(Date.parse(drill.time_start) - tappedStart)).toBeLessThan(3000);
    expect(Math.abs(Date.parse(drill.time_stop) - tappedStop)).toBeLessThan(3000);
    expect(errors).toEqual([]);

    await page.request.delete(`/api/${root}/sessions/${session.id}`, { headers });
});

test('a quick session completed with no signal is kept on the device and syncs on reconnect', async ({ page, context }, testInfo) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const token = await logIn(page);
    const root = `browser-offline-quick-root-${testInfo.project.name}`;
    const headers = { Authorization: `Bearer ${token}` };
    const activity = await (await page.request.post(`/api/${root}/activities`, {
        headers, data: { name: 'Dead-zone weigh-in', has_metrics: false },
    })).json();
    const templateName = `Offline Quick ${testInfo.project.name}`;
    expect((await page.request.post(`/api/${root}/session-templates`, {
        headers, data: { name: templateName, template_data: { session_type: 'quick', activities: [{ activity_id: activity.id }] } },
    })).ok()).toBeTruthy();

    await page.goto(`/${root}/create-session`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    const fromTemplate = page.getByText('From Template', { exact: true });
    if (await fromTemplate.isVisible()) await fromTemplate.click();
    await page.getByText(templateName, { exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Quick Session · ${templateName}` });
    await expect(dialog).toBeVisible();

    await context.setOffline(true);
    await dialog.getByRole('button', { name: '✓ Complete Quick Session', exact: true }).click();
    await expect(page.getByText("Quick session saved on this device. It will sync when you're back online.")).toBeVisible();
    await expect(dialog).toBeHidden();
    const chip = page.getByRole('status').filter({ hasText: /Offline|Syncing|synced/ });
    await expect(chip).toContainText('1 change saved on this device');

    await context.setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: 'All changes synced' })).toBeVisible({ timeout: 30_000 });
    const sessions = await (await page.request.get(`/api/${root}/sessions`, { headers })).json();
    const synced = sessions.sessions.filter((session) => session.template_id && session.completed);
    expect(synced).toHaveLength(1);
    expect(errors).toEqual([]);
});

test('a circuit and an extra round added with no signal sync with the ids the phone showed', async ({ page, context }, testInfo) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const token = await logIn(page);
    const root = `browser-offline-circuit-root-${testInfo.project.name}`;
    const headers = { Authorization: `Bearer ${token}` };
    const post = async (path, data) => {
        const response = await page.request.post(`/api/${root}/${path}`, { headers, data });
        expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
        return response.json();
    };
    const row = await post('activities', { name: 'Ring row', has_metrics: false });
    const jump = await post('activities', { name: 'Box jump', has_metrics: false });
    const circuitName = `Dead-zone finisher ${testInfo.project.name}`;
    await post('circuits', { name: circuitName, slots: [{ activity_definition_id: row.id }, { activity_definition_id: jump.id }] });
    const session = await post('sessions', {
        name: 'Circuit dead zone', goal_ids: [root], session_data: { sections: [{ name: 'Main', items: [] }] },
    });

    // Record the ids the phone minted when its queued writes reach the server.
    const sentIds = {};
    page.on('request', (request) => {
        const body = request.postDataJSON?.();
        if (request.method() !== 'POST' || !body) return;
        if (request.url().endsWith('/circuit-runs')) sentIds.run = body.id;
        if (request.url().endsWith('/rounds')) sentIds.round = body.round_id;
    });

    await page.goto(`/${root}/session/${session.id}`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.getByText('+ Add Activity').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.waitForTimeout(1500); // let the session and circuit catalogue persist

    await context.setOffline(true);
    await page.getByText('+ Add Activity').first().click();
    await page.getByRole('tab', { name: 'Activity Circuits' }).click();
    await page.getByRole('button', { name: `Select ${circuitName}` }).click();
    const card = page.getByRole('group', { name: `Activity circuit ${circuitName}`, exact: true });
    await expect(card.getByRole('group', { name: 'Round 1', exact: true })).toBeVisible();
    await card.getByRole('button', { name: '+ Add Round' }).click();
    await expect(card.getByRole('group', { name: 'Round 2', exact: true })).toBeVisible();

    // Reopen in the dead zone: the queued circuit and its new round are still there.
    await page.reload();
    const reopened = page.getByRole('group', { name: `Activity circuit ${circuitName}`, exact: true });
    await expect(reopened.getByRole('group', { name: 'Round 2', exact: true })).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: 'All changes synced' })).toBeVisible({ timeout: 30_000 });
    const runs = await (await page.request.get(`/api/${root}/sessions/${session.id}/circuit-runs`, { headers })).json();
    expect(runs).toHaveLength(1);
    const [run] = runs;
    expect(run.id).toBe(sentIds.run);
    expect(run.rounds.map((round) => round.round_number)).toEqual([1, 2]);
    expect(run.rounds[1].id).toBe(sentIds.round);
    expect(run.rounds.every((round) => round.members.length === 2)).toBe(true);
    const sessionAfter = await (await page.request.get(`/api/${root}/sessions/${session.id}`, { headers })).json();
    expect(JSON.stringify(sessionAfter.attributes.session_data.sections)).toContain(run.id);
    expect(errors).toEqual([]);

    await page.request.delete(`/api/${root}/sessions/${session.id}`, { headers });
});

test('signed out with no signal, the app says so and recovers when the connection returns', async ({ page, context }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await logIn(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.getByRole('button', { name: 'LOGOUT' }).click();
    await expect(page.getByText('LOG IN', { exact: true })).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
    await expect(page.getByText('LOG IN', { exact: true })).toHaveCount(0);

    // No action needed: the screen gives way to sign-in as soon as the connection returns.
    await context.setOffline(false);
    await expect(page.getByRole('heading', { name: "You're offline" })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText('LOG IN', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
});
