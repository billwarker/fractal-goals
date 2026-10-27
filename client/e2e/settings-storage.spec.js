import { expect, test } from '@playwright/test';

async function logIn(page) {
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
}

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('deep link opens Cloud Storage settings for an unconfigured deployment', async ({ page }) => {
    await logIn(page);
    await page.goto('/?settings=storage');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings.getByRole('heading', { name: 'Cloud storage' })).toBeVisible();
    await expect(settings.getByRole('article', { name: 'Google Drive' })).toContainText('isn’t available on this deployment');
    await expect(settings.getByRole('article', { name: 'Dropbox' })).toContainText('Unavailable');
    await expect(settings.getByText(/paste shared links/)).toBeVisible();
    await expect(page).not.toHaveURL(/settings=/);
    expect(await noHorizontalScroll(page)).toBe(true);
});

test('connected and expired accounts lay out with their actions', async ({ page }) => {
    await page.route('**/api/storage/connections', (route) => route.fulfill({ json: {
        providers: [
            { provider: 'google_drive', configured: true, status: 'active', connected: true,
              account_label: 'a-very-long-address-for-layout@example-domain.test', connected_at: '2026-10-01T00:00:00Z', attachment_count: 12 },
            { provider: 'dropbox', configured: true, status: 'reconnect_required', connected: false,
              account_label: 'me@dropbox.test', connected_at: '2026-09-01T00:00:00Z', attachment_count: 1 },
        ],
        limits: { max_file_bytes: 104857600, max_attachments: 8 },
    } }));
    await logIn(page);
    await page.goto('/?settings=storage');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    const drive = settings.getByRole('article', { name: 'Google Drive' });
    await expect(drive).toContainText('12 attachments');
    await drive.getByRole('button', { name: 'Disconnect Google Drive' }).click();
    await expect(drive.getByRole('group', { name: 'Confirm disconnecting Google Drive' })).toContainText('12 attachments will stop displaying');
    await expect(settings.getByRole('article', { name: 'Dropbox' }).getByRole('button', { name: 'Reconnect Dropbox' })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
});

test('the provider return page explains an incomplete connection', async ({ page }) => {
    await page.goto('/storage/connected?provider=dropbox&result=cancelled');
    await expect(page.getByRole('heading', { name: 'Connection not completed' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText('Dropbox connection cancelled. Nothing was changed.');
    await expect(page.getByRole('link', { name: 'Open cloud storage settings' })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
});

test('with two accounts connected the user chooses where uploads are saved', async ({ page }) => {
    let destination = 'google_drive';
    await page.route('**/api/storage/connections', (route) => route.fulfill({ json: {
        providers: [
            { provider: 'google_drive', configured: true, status: 'active', connected: true, account_label: 'me@gmail.test', attachment_count: 0 },
            { provider: 'dropbox', configured: true, status: 'active', connected: true, account_label: 'me@dropbox.test', attachment_count: 0 },
        ],
        upload_destination: destination,
        limits: { max_file_bytes: 104857600, max_attachments: 8 },
    } }));
    await page.route('**/api/storage/upload-destination', (route) => {
        destination = route.request().postDataJSON().provider;
        return route.fulfill({ json: { upload_destination: destination } });
    });
    await logIn(page);
    await page.goto('/?settings=storage');
    const group = page.getByRole('radiogroup', { name: 'Save new uploads to' });
    await expect(group.getByRole('radio', { name: /Google Drive/ })).toBeChecked();
    await group.getByText('Dropbox', { exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('New uploads will be saved to Dropbox.');
    await expect(group.getByRole('radio', { name: /Dropbox/ })).toBeChecked();
    expect(destination).toBe('dropbox');
    expect(await noHorizontalScroll(page)).toBe(true);
});

