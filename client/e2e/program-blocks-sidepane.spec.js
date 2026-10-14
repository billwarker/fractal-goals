import { expect, test } from '@playwright/test';

// Uses the "Browser Planning" fractal: its program's goal is the fractal root, and "Block 1"
// runs from a week ago to three weeks ahead.
test('summarizes a block in the calendar pane and adds a program day with optional goals', async ({ page }, testInfo) => {
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
    const programView = page.getByRole('tablist', { name: 'Program view', exact: true });
    const sidebar = page.getByRole('complementary', { name: 'Program side pane', exact: true });
    await expect(programView).toBeVisible();
    await expect(sidebar.getByRole('tablist', { name: 'Program view', exact: true })).toHaveCount(0);
    const viewBox = await programView.boundingBox();
    const optionsBox = await page.getByRole('button', { name: 'Program Options', exact: true }).boundingBox();
    expect(viewBox.x + viewBox.width).toBeLessThanOrEqual(optionsBox.x);
    // Heights can differ by a sub-pixel rounding fraction; compare to 0.01px.
    expect(viewBox.height).toBeCloseTo(optionsBox.height, 2);
    expect(optionsBox.height).toBeCloseTo(suffix === 'mobile' ? 44 : 32, 2);
    if (suffix === 'desktop') {
        const sidebarButtonBox = await page.getByRole('button', { name: 'Hide Sidebar', exact: true }).boundingBox();
        expect(sidebarButtonBox.height).toBeCloseTo(optionsBox.height, 2);
    }
    if (suffix === 'desktop') {
        const title = page.getByRole('heading', { level: 1 });
        const subtitle = title.locator('xpath=../following-sibling::p');
        await expect(subtitle).toBeVisible();
        expect((await subtitle.boundingBox()).y).toBeGreaterThan((await title.boundingBox()).y);
    }
    if (suffix === 'mobile') {
        await page.getByRole('button', { name: 'Show Sidebar' }).click();
    }
    const block = page.getByRole('article', { name: 'Block 1' });
    await expect(block).toBeVisible();
    const expectSidebarHeader = async () => {
        const toggle = sidebar.getByRole('tablist', { name: 'Program side pane views', exact: true });
        const collapse = sidebar.getByRole('button', { name: 'Collapse', exact: true });
        // The mobile sheet slides in; measure once it has settled.
        await expect(async () => {
            const toggleBox = await toggle.boundingBox();
            const collapseBox = await collapse.boundingBox();
            expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(collapseBox.x);
            expect(Math.abs(toggleBox.y - collapseBox.y)).toBeLessThan(8);
        }).toPass();
    };
    await expectSidebarHeader();

    // The summary shows days by status and goal counts, with no focus or alignment.
    await expect(block.getByRole('list', { name: 'Block 1 program days by status' })).toBeVisible();
    await expect(block.getByText('Goals completed/due')).toBeVisible();
    await expect(block.getByText(/Alignment|Pick a focus/)).toHaveCount(0);

    // Program days belong to the program: they are created from the Days tab's side pane and
    // take optional goals from the program's goals.
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Collapse' }).click();
    await page.getByRole('tab', { name: 'Days' }).click();
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Show Sidebar' }).click();
    await expectSidebarHeader();
    await page.getByRole('button', { name: 'New program day' }).click();
    const editor = page.getByRole('dialog').filter({ has: page.getByRole('textbox', { name: 'Day Name *', exact: true }) });
    await editor.getByLabel('Day Name *').fill('Tempo');
    await expect(editor.getByText('Day goals', { exact: true })).toBeVisible();
    await editor.getByRole('button', { name: 'Choose goals' }).click();
    await page.getByRole('checkbox', { name: `Select ${rootName}` }).check();
    await page.getByRole('button', { name: /^Apply \(1\)$/ }).click();
    await editor.getByRole('button', { name: 'Create Day' }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByRole('button', { name: 'Edit Tempo' })).toBeVisible();
});
