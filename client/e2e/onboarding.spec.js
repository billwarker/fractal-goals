import { expect, test } from '@playwright/test';

// A brand-new account: signs in through the form rather than the shared saved session.
test.use({ storageState: { cookies: [], origins: [] } });

test('a new account walks through the welcome flow into its first goal tree', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill(`welcome_user_${suffix}`);
    await page.getByLabel('Password', { exact: true }).fill('WelcomeTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();

    // No fractals yet: the welcome flow, keyboard first.
    await expect(page.getByRole('heading', { name: 'Turn a big goal into a tree you can work on' })).toBeFocused();
    await page.getByRole('button', { name: 'Get started' }).click();

    await expect(page.getByRole('heading', { name: 'What’s the big goal?' })).toBeFocused();
    await page.getByRole('button', { name: 'Play guitar at a jam session' }).click();
    await expect(page.getByLabel('Your big goal')).toHaveValue('Play guitar at a jam session');
    await page.getByLabel('Your big goal').press('Enter');

    await expect(page.getByRole('heading', { name: 'Break it down' })).toBeFocused();
    await page.getByLabel('Long-term goal 1').fill(`Learn 20 standards ${suffix}`);
    await page.getByLabel('Long-term goal 2').fill(`Comp with confidence ${suffix}`);
    await expect(page.getByLabel('Preview of your tree')).toContainText(`Learn 20 standards ${suffix}`);
    await page.getByRole('button', { name: 'Create my tree' }).click();

    // One request made the fractal and both goals; the app lands on them.
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByText(`Learn 20 standards ${suffix}`).first()).toBeVisible();
    await expect(page.getByText(`Comp with confidence ${suffix}`).first()).toBeVisible();

    // Back on Selection, the new fractal is there and the welcome flow is gone.
    await page.goto('/');
    await expect(page.getByText('Play guitar at a jam session').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Turn a big goal into a tree you can work on' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
});
