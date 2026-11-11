import { expect, test } from '@playwright/test';

import { BROWSER_USER, BROWSER_USER_STATE, saveApiToken } from './support/session.js';

// Signs the workflow suite's user in once; desktop and mobile projects reuse the saved state.
test('sign in the browser user', async ({ page }) => {
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill(BROWSER_USER.username);
    await page.getByLabel('Password', { exact: true }).fill(BROWSER_USER.password);
    const login = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    const { token } = await (await login).json();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible({ timeout: 20_000 });
    saveApiToken(token);
    await page.context().storageState({ path: BROWSER_USER_STATE });
});
