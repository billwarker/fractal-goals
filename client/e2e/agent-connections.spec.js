import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('AI connection settings are keyboard accessible and revoke delegated grants', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText(`Browser Practice ${suffix}`).first()).toBeVisible();
    await page.goto(`/browser-root-${suffix}/goals`);

    const settingsButton = page.getByRole('button', { name: 'SETTINGS', exact: true });
    await settingsButton.focus();
    await settingsButton.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    const connectionsButton = dialog.getByRole('button', { name: 'AI Connections', exact: true });
    await connectionsButton.focus();
    await connectionsButton.press('Enter');
    await expect(connectionsButton).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('heading', { name: 'Connected services' })).toBeVisible();
    const connection = dialog.locator('article').filter({ hasText: `Browser AI Settings ${suffix}` });
    await expect(connection).toBeVisible();

    const revokeButton = connection.getByRole('button', { name: 'Revoke', exact: true });
    await revokeButton.focus();
    await revokeButton.press('Enter');
    await expect(connection).toHaveCount(0);
    await expect(dialog.getByRole('alert')).toHaveCount(0);

    const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
    expect(errors).toEqual([]);
});

test('Ask AI reviews a proposal by keyboard, the worker applies it, and the tree refreshes while minimized', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const suffix = testInfo.project.name;
    // A dedicated fractal whose seeded conversation ends in a create-goal proposal.
    const rootId = `browser-ai-root-${suffix}`;
    const goalName = `Weekly mobility ${suffix}`;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText(`Browser Practice ${suffix}`).first()).toBeVisible();
    await page.goto(`/${rootId}/goals`);
    await expect(page.getByText(goalName, { exact: true })).toHaveCount(0);

    // The pop-up is non-modal, opens from the keyboard, and closes with Escape back to its opener.
    const askAi = page.getByRole('button', { name: 'ASK AI', exact: true });
    await askAi.focus();
    await askAi.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Ask AI' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'false');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(askAi).toBeFocused();

    // Server state survives navigation: the conversation is still there on another page.
    await askAi.press('Enter');
    await expect(dialog.getByText('Add a long-term goal for weekly mobility work.', { exact: true })).toBeVisible();
    await expect(dialog.getByText('I prepared one change for you to review.', { exact: true })).toBeVisible();
    // No provider keys are configured here, and the pop-up says so instead of offering a composer.
    await expect(dialog.getByRole('status').filter({ hasText: 'No embedded provider is available' })).toBeVisible();
    await page.getByRole('link', { name: 'PROGRAMS', exact: true }).click();
    await expect(page).toHaveURL(`/${rootId}/programs`);
    await expect(dialog.getByText('Add a long-term goal for weekly mobility work.', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'GOALS', exact: true }).click();
    await expect(page).toHaveURL(`/${rootId}/goals`);

    const review = dialog.getByRole('region', { name: 'Review proposed changes' });
    await expect(review).toContainText('awaiting approval');
    await expect(review).toContainText(goalName);
    const approve = review.getByRole('button', { name: 'Approve and run' });
    await approve.focus();
    await approve.press('Enter');
    await expect(review).toContainText('approved', { timeout: 10_000 });
    await expect(review.getByRole('button', { name: 'Approve and run' })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Minimize AI assistant' }).click();
    await expect(dialog).toBeHidden();
    // The change subscription refreshes the visible tree once the worker has applied it.
    await expect(page.getByText(goalName, { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByText(goalName, { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
});
