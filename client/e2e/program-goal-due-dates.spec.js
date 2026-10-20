import { expect, test } from '@playwright/test';

// Uses the "Browser Planning" fractal: its program's goal is the fractal root, with no due date.
test('sets a goal due date by dragging it onto a calendar day, with undo, on desktop only', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const rootId = `browser-plan-root-${suffix}`;
    const rootName = `Browser Planning ${suffix}`;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('fractal_timezone_preference', 'UTC'));
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();

    await page.goto(`/${rootId}/programs`);
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Show Sidebar' }).click();
    const sidebar = page.getByRole('complementary', { name: 'Program side pane', exact: true });
    await sidebar.getByRole('tab', { name: 'Goals' }).click();
    const row = sidebar.locator(`[data-goal-id="${rootId}"]`);
    await expect(row).toBeVisible();

    if (suffix === 'mobile') {
        // Mobile edits due dates in the goal modal; the pane offers no drag.
        await expect(row).not.toHaveAttribute('data-goal-due-drag', 'true');
        await expect(sidebar.getByText(/Drag a goal onto a day/)).toHaveCount(0);
        expect(errors).toEqual([]);
        return;
    }

    await expect(sidebar.getByText(/Drag a goal onto a day to set its due date\./)).toBeVisible();
    const target = new Date(Date.now() + 3 * 86400000);
    const targetLabel = target.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
    const cell = page.getByRole('gridcell', { name: targetLabel, exact: true }).first();
    await expect(cell).toBeVisible();

    const from = await row.locator('[class*="sessionNodeName"]').boundingBox();
    const to = await cell.boundingBox();
    await page.mouse.move(from.x + 10, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 30, from.y + from.height / 2, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();

    const toast = page.getByRole('status').filter({ hasText: `${rootName}: due` });
    await expect(toast).toBeVisible();
    const badge = cell.getByRole('button', { name: `Open goal: ${rootName}` });
    await expect(badge).toContainText('Due:');
    // The pane shows the same date in its due column, right of the tree.
    await expect(row.locator('[data-due-tone]')).toHaveText(/Due: 3d/);
    if (process.env.DUE_SCREENSHOT) await page.screenshot({ path: process.env.DUE_SCREENSHOT.replace('.png', `-${testInfo.project.name}.png`) });

    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(badge).toHaveCount(0);
    await expect(row.locator('[data-due-tone]')).toHaveCount(0);
    expect(errors).toEqual([]);
});
