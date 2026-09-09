import { expect, test } from '@playwright/test';

test('production landing, authenticated goals and session survive navigation and reload', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible();
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    const suffix = testInfo.project.name;
    await page.goto(`/browser-root-${suffix}/goals`);
    await expect(page.getByText(`Browser Practice ${suffix}`).first()).toBeVisible();
    await page.goto(`/browser-root-${suffix}/session/browser-session-${suffix}`);
    await expect(page.getByText('Focused Practice').first()).toBeVisible();
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.locator('[title="Mark Session Complete"]:visible')).toBeVisible();
    await page.locator('[title="Mark Session Complete"]:visible').click();
    await expect(page.locator('[title="Mark Session Incomplete"]:visible')).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByText('Focused Practice').first()).toBeVisible();
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.locator('[title="Mark Session Incomplete"]:visible')).toHaveAttribute('aria-pressed', 'true');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
});
