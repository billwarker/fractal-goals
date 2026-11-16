import { expect, test } from '@playwright/test';

import { apiToken, openOrigin } from './support/session.js';

test('a quick session is logged on Create Session, completed in one step, and repeated', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openOrigin(page);
    const token = apiToken();
    const root = `browser-quick-session-root-${testInfo.project.name}`;
    const headers = { Authorization: `Bearer ${token}` };
    const activityResponse = await page.request.post(`/api/${root}/activities`, {
        headers, data: { name: 'Quick Completion Practice', has_metrics: true, metrics: [
            { name: 'Weight', unit: 'Lbs', input_type: 'number' },
        ] },
    });
    expect(activityResponse.ok()).toBeTruthy();

    await page.goto(`/${root}/create-session`);
    await page.getByRole('button', { name: /Quick Session/ }).first().click();
    const section = page.getByRole('region', { name: 'Select Activities' });
    await expect(section).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent Quick Sessions' })).toBeVisible();
    const complete = page.getByRole('button', { name: 'Complete Session', exact: true }).first();
    await expect(complete).toBeDisabled();

    await section.getByRole('button', { name: '+ Add activity' }).click();
    await page.getByRole('button', { name: /Quick Completion Practice/ }).first().click();
    await expect(section.getByText('Quick Completion Practice')).toBeVisible();
    await expect(section.getByRole('button', { name: '✓ Complete', exact: true })).toHaveCount(0);
    await expect(section.getByTitle('Start timer')).toHaveCount(0);
    await section.getByRole('textbox', { name: 'logged Weight' }).fill('195');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('quick-session-composer.png') });

    const completion = page.waitForResponse((response) => response.url().endsWith('/sessions/quick-complete'));
    await expect(complete).toBeEnabled();
    await complete.click();
    const response = await completion;
    expect(response.status()).toBe(201);
    const session = await response.json();
    expect(session.completed).toBe(true);
    expect(session.session_type).toBe('quick');
    expect(session.template_id).toBeNull();
    const instances = await page.request.get(`/api/${root}/sessions/${session.id}/activities`, { headers });
    expect(instances.ok()).toBeTruthy();
    const rows = await instances.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].completed).toBe(true);
    // Typed and completed without leaving the field: the value still reaches the session.
    expect(rows[0].metrics).toEqual([expect.objectContaining({ value: 195 })]);

    // The composer starts over and the session leads the recent list, ready to repeat.
    await expect(section.getByText('Quick Completion Practice')).toHaveCount(0);
    await page.getByRole('button', { name: /^Log Quick Completion Practice again/ }).first().click();
    await expect(section.getByText('Quick Completion Practice')).toBeVisible();
    await expect(section.getByRole('textbox', { name: 'logged Weight' })).toHaveAttribute('placeholder', '195');

    // The completed session opens in a modal, showing what was logged.
    await page.goto(`/${root}/sessions?quickSessionId=${session.id}`);
    const modal = page.getByRole('dialog', { name: /^Quick session:/ });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('textbox').first()).toHaveValue(/^195/);
    expect(errors).toEqual([]);
});

test('a quick session that meets a threshold says so, and the goal asks for its completion note', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openOrigin(page);
    const headers = { Authorization: `Bearer ${apiToken()}` };
    const root = `browser-quick-session-root-${testInfo.project.name}`;
    const suffix = Date.now().toString(36);
    const api = async (path, data) => {
        const response = await page.request.post(`/api/${root}/${path}`, { headers, data });
        expect(response.ok(), `${path}: ${response.status()}`).toBeTruthy();
        return response.json();
    };
    const activity = await api('activities', {
        name: `Toast Lever ${suffix}`, has_metrics: true, metrics: [{ name: 'Hold', unit: 'Seconds', input_type: 'number' }],
    });
    const goalName = `Hold the lever ${suffix}`;
    await api('goals', {
        name: goalName, type: 'ShortTermGoal', parent_id: root, completion_condition: 'activity_threshold',
        condition: {
            activity_definition_id: activity.id, kind: 'single_session', measure: 'sets', min_sets: 1,
            rules: [{ metric_definition_id: activity.metric_definitions[0].id, operator: '>=', value: 5 }],
        },
    });

    await page.goto(`/${root}/create-session?source=quick&activities=${activity.id}`);
    const section = page.getByRole('region', { name: 'Select Activities' });
    await expect(section.getByText(activity.name)).toBeVisible();
    await section.getByRole('textbox', { name: 'logged Hold' }).fill('6');
    await page.getByRole('button', { name: 'Complete Session', exact: true }).first().click();

    const toast = page.getByText(`Completed — Short Term Goal: ${goalName}`);
    await expect(toast).toBeVisible();
    await page.getByRole('button', { name: 'Write note' }).click();
    const note = page.getByRole('textbox', { name: 'Goal Completion Note' });
    await expect(note).toBeVisible();
    await note.fill('Six seconds, clean.');
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(page.getByText('Six seconds, clean.')).toBeVisible();
    // With its note written, the goal no longer asks for one.
    await expect(page.getByRole('region', { name: 'Add a completion note' })).toHaveCount(0);
    expect(errors).toEqual([]);
});
