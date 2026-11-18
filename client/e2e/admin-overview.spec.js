import { expect, test } from '@playwright/test';

// Admin → Overview: one area per sub-tab over a single usage request (components/admin/UsagePanel.jsx).
test.use({ storageState: { cookies: [], origins: [] } });

const TABS = ['Summary', 'Acquisition', 'Engagement', 'People', 'Events', 'System'];

async function openAdmin(page) {
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('sweep_admin');
    await page.getByLabel('Password', { exact: true }).fill('SweepAdmin123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Play jazz guitar at a jam session').first()).toBeVisible();
    await page.goto('/admin');
}

test('each area has its own tab, and the open one survives a reload', async ({ page }) => {
    await openAdmin(page);

    // Account totals arrive as numbers: never the loading placeholder, never "unavailable".
    const totals = page.getByRole('list', { name: 'Account totals' });
    const users = totals.getByRole('listitem').filter({ has: page.getByText('Users', { exact: true }) });
    await expect(users).toHaveText(/^Users\s*\d+$/);
    await expect(totals).not.toContainText('unavailable');

    for (const tab of TABS) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await expect(page.getByRole('tabpanel', { name: tab })).toBeVisible();
    }
    await expect(page.getByText(/of [\d.]+ MB database quota/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scheduled jobs' })).toBeVisible();

    await page.getByRole('tab', { name: 'People', exact: true }).click();
    await expect(page).toHaveURL(/\?view=people$/);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'People', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('searchbox', { name: 'Search users' })).toBeVisible();
});

test('on a phone the tabs scroll, not the page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAdmin(page);

    for (const tab of TABS) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await expect(page.getByRole('tabpanel', { name: tab })).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${tab} scrolls sideways`).toBeLessThanOrEqual(0);
    }
});
