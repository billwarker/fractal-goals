import { expect, test } from '@playwright/test';

async function logIn(page) {
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    const login = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    const { token } = await (await login).json();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    return token;
}

// The "Browser Planning" root sits on the Ultimate level, which uses a success vision and is reviewed yearly.
test('a due review shows a Review banner and can be written from goal details', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const root = `browser-plan-root-${suffix}`;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('fractal_timezone_preference', 'UTC'));
    const headers = { Authorization: `Bearer ${await logIn(page)}` };
    // Started over a year ago, so its first yearly review is due.
    const started = await page.request.put(`/api/${root}/goals/${root}`, {
        headers, data: { started_at: '2025-01-01', description: 'Plan sessions that build toward a recital.' },
    });
    expect(started.ok(), await started.text()).toBeTruthy();

    await page.goto(`/${root}/goals`);
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Tree', exact: true }).click();
    const details = suffix === 'mobile' ? page.getByRole('dialog', { name: `Browser Planning ${suffix}` }) : page;
    await expect(async () => {
        await page.locator('.react-flow__node').filter({ hasText: `Browser Planning ${suffix}` }).getByText(`Browser Planning ${suffix}`, { exact: true }).click();
        await expect(details.getByRole('region', { name: 'Review due' })).toBeVisible({ timeout: 2000 });
    }).toPass();
    await expect(details.getByText('Review every year · review due')).toBeVisible();
    // SMART's R is Reviewed: the due review takes it away until one is written.
    const smart = async () => (await (await page.request.get(`/api/${root}/goals/${root}`, { headers })).json()).smart_status.reviewed;
    expect(await smart()).toBe(false);

    // The banner offers only Review.
    const banner = details.getByRole('region', { name: 'Review due' });
    await expect(banner.getByRole('button')).toHaveText(['Review']);
    if (suffix === 'mobile') {
        expect(errors).toEqual([]);
        return;
    }

    await details.getByRole('button', { name: 'Review', exact: true }).click();
    const composer = page.getByRole('textbox').filter({ hasText: '## Review: Browser Planning desktop' });
    await expect(composer).toBeVisible();
    await expect(composer).toContainText('Plan sessions that build toward a recital.');
    await page.getByRole('button', { name: 'Save review' }).click();

    await expect(page.getByRole('region', { name: 'Review due' })).toHaveCount(0);
    await expect(page.getByText(/Review every year · next /)).toBeVisible();
    expect(await smart()).toBe(true);
    const notes = await (await page.request.get(`/api/${root}/goals/${root}/notes`, { headers })).json();
    expect(notes.some((note) => note.note_type === 'goal_review_note')).toBe(true);
    expect(errors).toEqual([]);
});
