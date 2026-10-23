import { expect, test } from '@playwright/test';

// Uses the "Browser Planning" fractal: its program's goal is the fractal root.
test('scopes a goal in the program Goals pane and creates a child under it', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const rootId = `browser-plan-root-${suffix}`;
    const rootName = `Browser Planning ${suffix}`;
    const childName = `Weekly mobility ${suffix}`;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('fractal_timezone_preference', 'UTC'));
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();

    const openGoalsPane = async () => {
        if (suffix === 'mobile') await page.getByRole('button', { name: 'Show Sidebar' }).click();
        const sidebar = page.getByRole('complementary', { name: 'Program side pane', exact: true });
        await sidebar.getByRole('tablist', { name: 'Program side pane views', exact: true })
            .getByRole('tab', { name: 'Goals' }).click();
        return sidebar;
    };
    await page.goto(`/${rootId}/programs`);
    let sidebar = await openGoalsPane();

    // No "+" until a goal is scoped through its icon; the same on desktop and mobile.
    await expect(sidebar.getByText('Select a goal’s icon to add a goal under it.')).toBeVisible();
    await expect(sidebar.getByRole('button', { name: /Add a child goal/ })).toHaveCount(0);
    await sidebar.getByRole('button', { name: `Scope to ${rootName}` }).click();
    await expect(sidebar.getByRole('button', { name: `Clear scope for ${rootName}` })).toHaveAttribute('aria-pressed', 'true');
    await sidebar.getByRole('button', { name: `Add a child goal under ${rootName}` }).click();

    // Any lower level may be chosen; the full goal modal follows.
    const dialog = page.getByRole('dialog', { name: 'New goal' });
    await dialog.getByRole('button', { name: 'Mid Term Goal' }).click();
    await dialog.getByLabel('Name', { exact: true }).fill(childName);
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // The pane shows the new goal at once, marked, and keeps the scope.
    const created = sidebar.locator('[data-just-created="true"]');
    await expect(created).toContainText(childName);
    await expect(sidebar.getByRole('button', { name: `Clear scope for ${rootName}` })).toBeVisible();

    // It is saved under the program's goal, so it stays in the program's Goals pane.
    await page.reload();
    sidebar = await openGoalsPane();
    await expect(sidebar.getByText(childName, { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
});
