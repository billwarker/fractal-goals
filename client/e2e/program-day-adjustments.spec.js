import { expect, test } from '@playwright/test';

// Create an isolated program so this workflow does not share scheduling state with other specs.
test('move and remove recurring program days from the day sidebar', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const today = new Date().toISOString().slice(0, 10);
    const later = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await page.addInitScript(() => localStorage.setItem('fractal_timezone_preference', 'UTC'));
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    const { token } = await (await loginResponse).json();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    const root = `browser-adjustments-root-${suffix}`;
    const created = await page.evaluate(async ({ root, today, end, token }) => {
        const response = await fetch(`/api/${root}/programs`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: 'Schedule Adjustments', start_date: today, end_date: end, weeklySchedule: [], selectedGoals: [] }),
        });
        if (!response.ok) throw new Error(`Program create failed: ${response.status} ${await response.text()}`);
        return response.json();
    }, { root, today, end, token });
    const days = await page.evaluate(async ({ root, program, today, later, token }) => {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const output = [];
        for (const [name, date] of [['Move Practice', today], ['Replace Practice', later]]) {
            const response = await fetch(`/api/${root}/programs/${program}/days`, {
                method: 'POST', headers, body: JSON.stringify({ name, day_of_week: [weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()]] }),
            });
            if (!response.ok) throw new Error(`Day create failed: ${response.status}`);
            output.push(await response.json());
        }
        return output;
    }, { root, program: created.id, today, later, token });
    await page.goto(`/${root}/programs`);
    // Choose the isolated program's ribbon when other programs share this date.
    await page.locator(`.fc-daygrid-day[data-date="${today}"]`).getByText('Move Practice', { exact: true }).click();
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Move Practice', exact: true }) }).first();
    await card.getByRole('button', { name: 'Move day', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('schedule-actions.png') });
    await card.getByRole('button', { name: 'Move day', exact: true }).click();
    await expect(page.getByText('Choose a destination on the calendar', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pick on calendar' })).toHaveCount(0);
    if (suffix === 'mobile') {
        await page.getByRole('button', { name: 'Collapse', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Program sidebar' })).toHaveCount(0);
        await page.locator(`.fc-daygrid-day[data-date="${later}"] .fc-daygrid-day-number`).click();
    } else {
        const destination = page.locator(`.fc-daygrid-day[data-date="${later}"]`);
        await expect(destination).toHaveAttribute('tabindex', '0');
        await destination.focus();
        await destination.press('Enter');
    }
    await expect(card.getByLabel('Move to date')).toHaveValue(later);
    await expect(page.locator(`.fc-daygrid-day[data-date="${today}"]`).getByText('Move Practice', { exact: true })).toHaveCount(1);
    await expect(page.locator(`.fc-daygrid-day[data-date="${later}"]`).getByText('Replace Practice', { exact: true })).toHaveCount(1);
    // Manual entry remains available after a calendar pick.
    await card.getByLabel('Move to date').fill(today);
    await expect(card.getByRole('button', { name: 'Move and replace' })).toBeDisabled();
    await card.getByLabel('Move to date').fill(later);
    await expect(card).toContainText('Replace Practice');
    const form = card.getByRole('form', { name: 'Move program day' });
    const bounds = await form.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
    await card.getByRole('button', { name: 'Move and replace' }).click();
    await expect(page.getByRole('heading', { name: 'Move Practice', exact: true })).toBeVisible();
    await expect(page.locator(`.fc-daygrid-day[data-date="${today}"]`).getByText('Move Practice', { exact: true })).toHaveCount(0);
    await expect(page.locator(`.fc-daygrid-day[data-date="${later}"]`).getByText('Move Practice', { exact: true })).toHaveCount(1);
    await expect(page.locator(`.fc-daygrid-day[data-date="${later}"]`).getByText('Replace Practice', { exact: true })).toHaveCount(0);
    await card.getByRole('button', { name: 'Remove from this date' }).click();
    await card.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Remove from this date' })).toBeFocused();
    await card.getByRole('button', { name: 'Remove from this date' }).click();
    await card.getByRole('button', { name: 'Remove day', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Plan this day' })).toBeVisible();
    await page.reload();
    await page.locator(`.fc-daygrid-day[data-date="${later}"] .fc-daygrid-day-number`).click();
    // The per-program exclusions survive a reload.
    const saved = await page.evaluate(async ({ root, program, token }) => {
        const response = await fetch(`/api/${root}/programs/${program}`, { headers: { Authorization: `Bearer ${token}` } });
        return response.json();
    }, { root, program: created.id, token });
    expect(saved.days.find((day) => day.id === days[0].id).excluded_dates).toContain(today);
    expect(saved.days.find((day) => day.id === days[1].id).excluded_dates).toContain(later);
});
