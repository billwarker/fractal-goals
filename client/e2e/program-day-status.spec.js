import { deviceOf, expect, test } from './support/clock.js';
import { dragBetween } from './support/pointer.js';

test('single and bulk program-day statuses persist in the calendar', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const device = deviceOf(testInfo);
    const today = new Date().toISOString().slice(0, 10);
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await page.addInitScript(() => localStorage.setItem('fractal_timezone_preference', 'UTC'));
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    await page.goto(`/browser-root-${suffix}/programs`);

    await page.locator(`.fc-daygrid-day[data-date="${today}"] .fc-daygrid-day-number`).click();
    const dayCard = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Daily Practice', exact: true }) }).first();
    await dayCard.getByRole('button', { name: /Change status for Daily Practice/ }).click();
    const statusOptions = page.getByRole('group', { name: 'Day status options' });
    await expect(statusOptions).toBeVisible();
    const optionsBox = await statusOptions.boundingBox();
    expect(optionsBox.x).toBeGreaterThanOrEqual(0);
    expect(optionsBox.x + optionsBox.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
    expect(optionsBox.y).toBeGreaterThanOrEqual(0);
    expect(optionsBox.y + optionsBox.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
    await statusOptions.getByRole('button', { name: 'Mark complete' }).click();
    await expect(page.locator(`.fc-daygrid-day[data-date="${today}"] [data-program-day-status="complete"]`)).toHaveCount(1);
    const statusTrigger = dayCard.getByRole('button', { name: /Change status for Daily Practice/ });
    await expect(statusTrigger).toHaveAttribute('aria-expanded', 'false');
    await statusTrigger.click();
    await expect(page.getByText('Manual complete')).toBeVisible();

    if (device === 'mobile') await page.getByRole('button', { name: 'Collapse' }).click();
    await page.getByRole('button', { name: /Select Multiple Days|Select Days/ }).click();
    const selectedMetricsResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/metrics')
            && url.searchParams.get('dates') === `${today},${later}`;
    });
    await page.locator(`.fc-daygrid-day[data-date="${today}"]`).click();
    if (device === 'mobile') await page.getByRole('button', { name: 'Collapse' }).click();
    await page.locator(`.fc-daygrid-day[data-date="${later}"]`).click();
    const selectedMetrics = await (await selectedMetricsResponse).json();
    expect(selectedMetrics.window.dates).toEqual([today, later]);
    expect(selectedMetrics.window.total_days).toBe(2);
    await expect(page.getByText('Selected timeframe', { exact: true }).first().locator('..'))
        .toContainText('2 selected days');
    if (device === 'mobile') await page.getByRole('button', { name: 'Collapse' }).click();
    if (device === 'desktop') {
        const overview = page.getByLabel('Selected timeframe program overview');
        await expect(overview).toBeVisible();
        await expect(overview.locator('dl[aria-label="Program metrics"] dd').nth(3)).toHaveText('50%');
    }
    await expect(page.getByText('2 selected days').first()).toBeVisible();
    await expect(page.locator('[data-program-status-date]')).toHaveCount(0);
    await expect(page.locator(`.fc-daygrid-day[data-date="${today}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('region', { name: 'Program day status actions' })).toContainText('2 selected');
    await page.getByRole('button', { name: 'Rest', exact: true }).click();
    await expect(page.locator(`.fc-daygrid-day[data-date="${today}"]`)).not.toHaveAttribute('aria-selected', 'true');
    if (device === 'desktop') {
        await page.getByRole('button', { name: 'Select Multiple Days' }).click();
        await dragBetween(
            page,
            page.locator(`.fc-daygrid-day[data-date="${today}"]`),
            page.locator(`.fc-daygrid-day[data-date="${later}"]`),
        );
        // A drag selects every day in range; statuses apply to the scheduled ones (offsets 0, 1, 3).
        await expect(page.getByRole('region', { name: 'Program day status actions' })).toContainText('4 selected · 3 scheduled');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    await page.reload();
    await page.locator(`.fc-daygrid-day[data-date="${today}"] .fc-daygrid-day-number`).click();
    await page.getByRole('button', { name: /Change status for Daily Practice/ }).click();
    await expect(page.getByText('Manual rest')).toBeVisible();
});
