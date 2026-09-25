import { expect, test } from '@playwright/test';

function nextMonthTitle(title) {
    const date = new Date(`1 ${title} UTC`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

test('the program calendar can scroll weeks continuously and remembers the choice', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    await page.addInitScript(() => localStorage.setItem('fractal_timezone_preference', 'UTC'));
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    await page.goto(`/browser-root-${suffix}/programs`);

    const toggle = page.getByRole('checkbox', { name: 'Continuous' });
    await expect(toggle).not.toBeChecked();
    await expect(page.locator('.fc-dayGridMonth-view')).toBeVisible();

    await toggle.check();
    await expect(page.locator('.fc-dayGridContinuous-view')).toBeVisible();
    await expect(page.locator('.fc-dayGridContinuous-view .fc-day-other')).toHaveCount(0);
    expect(await page.locator('.fc-dayGridContinuous-view .fc-daygrid-body tr').count()).toBeGreaterThan(1);
    const title = page.locator('h2[aria-live="polite"]');
    const initialTitle = (await title.textContent()).trim();
    expect(initialTitle).toMatch(/^[A-Z][a-z]+ \d{4}$/);

    // The window is a year centred on today; the title follows the scrolled week rows.
    const days = page.locator('.fc-dayGridContinuous-view .fc-daygrid-day[data-date]');
    expect(await days.count()).toBe(52 * 7);
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(title).toHaveText(nextMonthTitle(initialTitle));
    await expect(page.locator('.fc-daygrid-day[data-date$="-01"] .fc-daygrid-day-number').first())
        .toHaveText(/^[A-Z][a-z]{2}1$/);
    // No cell carries FullCalendar's month-prefixed day number.
    await expect(page.locator('.fc-daygrid-day-number', { hasText: /^[A-Z][a-z]+ \d/ })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Continuous' })).toBeChecked();
    await expect(page.locator('.fc-dayGridContinuous-view')).toBeVisible();

    await page.getByRole('checkbox', { name: 'Continuous' }).uncheck();
    await expect(page.locator('.fc-dayGridMonth-view')).toBeVisible();
});
