import { expect, test } from '@playwright/test';

test('program date header, view toggle, and session options fit the sidebar', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const today = new Date().toISOString().slice(0, 10);
    await page.addInitScript(() => localStorage.setItem('fractal_timezone_preference', 'UTC'));
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();

    // Exercise the real read model with a logged-session fixture, including a retired payload field.
    await page.route('**/day-read-model?*', async (route) => {
        const response = await route.fetch();
        const payload = await response.json();
        if (payload.detail) {
            const occurrence = payload.detail.occurrences[0];
            occurrence.credits = [{ session_id: 'layout-session', template_id: 'layout-template', source: 'linked' }];
            payload.detail.can_edit_credits = true;
            payload.detail.sessions = [{
                id: 'layout-session', name: 'Upper Body Session', completed: true,
                template: { id: 'layout-template', name: 'Upper Body – Medium', color: '#e9c34b' },
                session_start: `${today}T07:12:00Z`, session_end: `${today}T09:05:00Z`,
                total_duration_seconds: 6720, relation: 'credited',
                credit: { source: 'linked', template_id: 'layout-template' },
                alignment: { aligned_ratio: 0.92, activity_count: 12 },
            }];
        }
        await route.fulfill({ response, json: payload });
    });
    await page.goto(`/browser-root-${suffix}/programs`);
    const toggle = page.getByRole('tablist', { name: 'Program view' });
    await expect(toggle).toBeVisible();
    for (const label of ['Calendar', 'Days']) {
        const tab = toggle.getByRole('tab', { name: label, exact: true });
        expect(await tab.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    expect((await toggle.boundingBox()).height).toBeLessThanOrEqual(suffix === 'mobile' ? 44 : 33);
    await page.locator(`.fc-daygrid-day[data-date="${today}"] .fc-daygrid-day-number`).click();
    const pane = page.getByRole('complementary', { name: 'Program side pane' });
    await expect(pane).toBeVisible();
    await expect(pane.getByRole('button', { name: 'Previous day' })).toHaveCount(0);
    await expect(pane.getByRole('button', { name: 'Next day' })).toHaveCount(0);
    await expect(pane.getByText('Linked', { exact: true })).toHaveCount(0);
    await expect(pane.getByText(/aligned/)).toHaveCount(0);
    const session = pane.getByRole('link', { name: /Upper Body/ });
    const options = pane.getByRole('button', { name: 'Change how Upper Body Session counts toward this day' });
    const duration = pane.getByText('1 hour 52 minutes', { exact: true });
    // The mobile sheet slides in; compare positions once it has settled, from one frame.
    await expect(async () => {
        const [identityBox, optionsBox, durationBox] = await Promise.all(
            [session, options, duration].map((node) => node.boundingBox()),
        );
        expect(optionsBox.x).toBeGreaterThanOrEqual(identityBox.x + identityBox.width);
        expect(Math.abs(optionsBox.y + optionsBox.height / 2 - identityBox.y - identityBox.height / 2)).toBeLessThanOrEqual(2);
        expect(durationBox.y).toBeGreaterThanOrEqual(optionsBox.y + optionsBox.height);
    }).toPass();
    const metadata = duration.locator('..');
    await expect(metadata).toContainText('Start 7:12 AM');
    await expect(metadata).toContainText('End 9:05 AM');
    expect(await pane.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('program-day-layout.png') });
    await options.click();
    await expect(page.getByRole('menuitem', { name: 'Don’t count toward this day' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(options).toBeFocused();
});
