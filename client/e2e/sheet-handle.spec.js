import { expect, test } from '@playwright/test';

const SHEETS = [
    { name: 'Sessions', path: 'browser-root-mobile/sessions', open: { name: 'Show Filters' } },
    { name: 'Notes', path: 'browser-root-mobile/notes', open: { name: 'Show Filters' } },
    { name: 'Analytics', path: 'browser-root-mobile/analytics', open: { name: 'Show Sidebar' } },
    { name: 'Session Detail', path: 'browser-root-mobile/session/browser-session-mobile', open: { name: 'Details', exact: true } },
    { name: 'Create Session', path: 'browser-sheet-handle-root-mobile/create-session', open: { name: 'Show Session Goals' } },
    { name: 'Programs', path: 'browser-plan-root-mobile/programs', open: { name: 'Show Sidebar' } },
];

async function dragHandle(page, distance) {
    const handle = await page.locator('[data-sheet-handle]').boundingBox();
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Slowly, so the release isn't a flick.
    for (let step = 1; step <= 5; step += 1) {
        await page.mouse.move(x, y + (distance * step) / 5);
        await page.waitForTimeout(40);
    }
    await page.waitForTimeout(150);
    await page.mouse.up();
}

test('dragging the bar down closes each sidebar sheet; a short drag slides back', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Bottom sheets are mobile only.');
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice mobile').first()).toBeVisible();

    for (const { name, path, open } of SHEETS) {
        await test.step(name, async () => {
            await page.goto(`/${path}`);
            await page.getByRole('button', open).click();
            const sheet = page.locator('.mobile-sheet-enter');
            await expect(sheet).toBeVisible();
            await page.waitForTimeout(350); // the entrance animation
            const top = (await sheet.boundingBox()).y;

            await dragHandle(page, 40);
            await expect(async () => {
                expect((await sheet.boundingBox()).y).toBeCloseTo(top, 0);
            }).toPass();

            await page.waitForTimeout(250);
            await dragHandle(page, 300);
            await expect(sheet).toHaveCount(0);
        });
    }
});
