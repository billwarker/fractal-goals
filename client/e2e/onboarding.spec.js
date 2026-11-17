import { expect, test } from '@playwright/test';

// A brand-new account: signs in through the form rather than the shared saved session.
test.use({ storageState: { cookies: [], origins: [] } });

test('a new account starts on Selection and creates its first fractal from New Fractal', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill(`new_user_${suffix}`);
    await page.getByLabel('Password', { exact: true }).fill('NewUserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();

    // No fractals yet: the ordinary Selection page, with Settings beside Logout and no welcome flow.
    await expect(page.getByRole('button', { name: 'SETTINGS' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'LOGOUT' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Turn a big goal into a tree you can work on' })).toHaveCount(0);

    await page.getByRole('button', { name: 'New Fractal' }).click();
    await page.getByLabel('Name (Required)').fill(`Play guitar at a jam session ${suffix}`);
    await page.getByRole('button', { name: 'Create this Fractal Goal' }).click();

    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByText(`Play guitar at a jam session ${suffix}`).first()).toBeVisible();

    await page.goto('/');
    await expect(page.getByText(`Play guitar at a jam session ${suffix}`).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
});
