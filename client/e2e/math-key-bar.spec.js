import { expect, test } from '@playwright/test';

import { apiToken, openOrigin } from './support/session.js';

test('a phone number field takes arithmetic through the +− keys beside it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'The key bar is for touch screens.');
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openOrigin(page);
    const root = `browser-quick-session-root-${testInfo.project.name}`;
    const activityResponse = await page.request.post(`/api/${root}/activities`, {
        headers: { Authorization: `Bearer ${apiToken()}` },
        data: { name: 'Math Key Practice', has_metrics: true, metrics: [
            { name: 'Weight', unit: 'Lbs', input_type: 'number' },
        ] },
    });
    expect(activityResponse.ok()).toBeTruthy();

    await page.goto(`/${root}/create-session`);
    await page.getByRole('button', { name: /Quick Session/ }).first().click();
    const section = page.getByRole('region', { name: 'Select Activities' });
    await section.getByRole('button', { name: '+ Add activity' }).click();
    await page.getByRole('button', { name: /Math Key Practice/ }).first().click();

    const weight = section.getByRole('textbox', { name: 'logged Weight' });
    await weight.click();
    await page.keyboard.type('2.5');
    const keys = page.getByRole('toolbar', { name: 'Math keys' });
    await expect(keys).toHaveCount(0);
    await section.getByRole('button', { name: 'Show math keys' }).click();
    await expect(keys).toBeVisible();
    await keys.getByRole('button', { name: 'Times' }).click();
    // The key bar never takes focus: typing carries on in the field.
    await expect(weight).toBeFocused();
    await page.keyboard.type('4');
    await expect(weight).toHaveValue('2.5×4');
    await expect(keys.getByRole('button', { name: 'Equals 10' })).toBeVisible();

    await weight.press('Enter');
    await expect(keys).toHaveCount(0);
    await expect(weight).toHaveValue(/^10(\.0+)?$/);
    expect(errors).toEqual([]);
});
