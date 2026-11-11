import { expect, test } from '@playwright/test';
import { AUTH_STATE } from './manifest.js';

// Logs the sweep's admin user in once; every sweep project reuses the saved state.
test('log in the sweep user', async ({ page }) => {
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('sweep_admin');
    await page.getByLabel('Password', { exact: true }).fill('SweepAdmin123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Play jazz guitar at a jam session').first()).toBeVisible();
    await page.context().storageState({ path: AUTH_STATE });
});
