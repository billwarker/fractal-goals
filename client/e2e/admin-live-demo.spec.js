import { expect, test } from '@playwright/test';
import { DEMO_SHOWCASE } from './demoIds';

// An admin's view of the live demo the fixture publishes (scripts/browser_test_server.py).
// Publishing itself is covered by tests/integration/test_demo_snapshots.py: republishing
// here would swap the copy under the demo specs running alongside.
test.use({ storageState: { cookies: [], origins: [] } });

test('an admin sees each demo’s snapshot and opens the copy visitors explore', async ({ page }) => {
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('sweep_admin');
    await page.getByLabel('Password', { exact: true }).fill('SweepAdmin123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Play jazz guitar at a jam session').first()).toBeVisible();

    await page.goto('/admin');
    await page.getByRole('button', { name: 'live demo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Live demo' })).toBeVisible();
    await expect(page.getByLabel('Public label').first()).toHaveValue('Jazz guitar');
    await expect(page.getByText(/Snapshot .* · \d+ goals · 15 sessions/)).toBeVisible();

    const openDemo = page.getByRole('link', { name: 'Open demo' }).first();
    await expect(openDemo).toHaveAttribute('href', `/demo/${DEMO_SHOWCASE}/goals?tour=1`);

    // The demo is the copy, in its own read-only app.
    await page.goto(await openDemo.getAttribute('href'));
    await expect(page.getByRole('region', { name: 'Demo guide' })).toBeVisible();
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
});
