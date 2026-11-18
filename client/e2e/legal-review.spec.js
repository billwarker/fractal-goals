import { expect, test } from '@playwright/test';

// An account behind on the legal documents reads each one to its end before it can accept.
test('an outdated acceptance is reviewed by reading both documents to the end', async ({ page }, testInfo) => {
    const accepted = [];
    let user = null;
    await page.route('**/api/auth/me', async (route) => {
        const response = await route.fetch();
        user = await response.json();
        await route.fulfill({ response, json: { ...user, legal_acceptance_required: accepted.length === 0 } });
    });
    await page.route('**/api/auth/legal/acceptance', async (route) => {
        accepted.push(route.request().postDataJSON());
        await route.fulfill({ json: { ...user, legal_acceptance_required: false } });
    });

    await page.goto('/');
    const dialog = page.getByRole('dialog', { name: 'Review Our Updated Terms' });
    await expect(dialog).toBeVisible();
    const reader = dialog.getByRole('tabpanel');
    const accept = dialog.getByRole('button', { name: 'Accept and Continue' });
    const checkbox = dialog.getByRole('checkbox');
    await expect(checkbox).toBeDisabled();
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath('review.png') });

    // Log Out and Accept share one row.
    const logOutBox = await dialog.getByRole('button', { name: 'Log Out' }).boundingBox();
    const acceptBox = await accept.boundingBox();
    expect(Math.abs(logOutBox.y - acceptBox.y)).toBeLessThan(2);

    const readToEnd = () => reader.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        element.dispatchEvent(new Event('scroll'));
    });
    await readToEnd();
    await expect(dialog.getByRole('tab', { name: /Terms of Service/ })).toContainText('Read');
    await expect(checkbox).toBeDisabled();
    await dialog.getByRole('button', { name: 'Continue to the Privacy Policy' }).click();
    await expect(dialog.getByRole('tab', { name: /Privacy Policy/ })).toHaveAttribute('aria-selected', 'true');
    await readToEnd();
    await expect(dialog.getByRole('tab', { name: /Privacy Policy/ })).toContainText('Read');

    await dialog.getByText('I am 16 or older', { exact: false }).click();
    await expect(checkbox).toBeChecked();
    await accept.click();
    await expect(dialog).toHaveCount(0);
    expect(accepted).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
