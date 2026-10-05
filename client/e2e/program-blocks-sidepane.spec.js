import { expect, test } from '@playwright/test';

// Uses the "Browser Planning" fractal: its program's goal is the fractal root, and "Block 1"
// runs from a week ago to three weeks ahead.
test('summarizes a block in the calendar pane and adds a day with optional goals', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const rootId = `browser-plan-root-${suffix}`;
    const rootName = `Browser Planning ${suffix}`;
    await page.addInitScript(() => localStorage.setItem('fractal_timezone_preference', 'UTC'));
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();

    await page.goto(`/${rootId}/programs`);
    // The Programs page has Calendar and Days only; blocks live in the calendar side pane.
    await expect(page.getByRole('tab', { name: 'Blocks' })).toHaveCount(0);
    if (suffix === 'mobile') {
        await page.getByRole('button', { name: 'Show Sidebar' }).click();
    }
    const block = page.getByRole('article', { name: 'Block 1' });
    await expect(block).toBeVisible();

    // The summary shows days by status and goal counts, with no focus or alignment.
    await expect(block.getByRole('list', { name: 'Block 1 program days by status' })).toBeVisible();
    await expect(block.getByText('Goals completed/due')).toBeVisible();
    await expect(block.getByText(/Alignment|Pick a focus/)).toHaveCount(0);

    // Days take optional goals from the program's goals.
    await block.getByRole('button', { name: '+ Add day' }).click();
    const editor = page.getByRole('dialog', { name: 'Add Program Day' });
    await editor.getByLabel('Day Name *').fill('Tempo');
    await expect(editor.getByText('Day goals', { exact: true })).toBeVisible();
    await editor.getByRole('button', { name: 'Choose goals' }).click();
    await page.getByRole('checkbox', { name: `Select ${rootName}` }).check();
    await page.getByRole('button', { name: /^Apply \(1\)$/ }).click();
    await editor.getByRole('button', { name: 'Add Day' }).click();
    await expect(editor).toBeHidden();
    await expect(block.getByRole('button', { name: 'Edit Tempo' })).toBeVisible();
});
