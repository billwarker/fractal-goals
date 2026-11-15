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
