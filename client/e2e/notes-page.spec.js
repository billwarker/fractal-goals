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

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const shown = (page) => page.getByText(/^\d+ notes?$/).first();

async function createFilterFromSearch(page, name) {
    await page.getByRole('button', { name: 'Create filter', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create filter' });
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByRole('button', { name: 'Create filter' }).click();
    await expect(dialog).toHaveCount(0);
}

test('saved keyword filters combine, the heatmap narrows to a day, and the URL restores it', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const root = `browser-root-${suffix}`;
    const marker = `zq${Date.now().toString(36)}${suffix[0]}`;
    const token = await logIn(page);
    for (const [content, extra] of [
        [`${marker} elbow cue during handstands`, { context_type: 'goal', context_id: root, goal_id: root }],
        [`${marker} scapula cue for the press`, { context_type: 'goal', context_id: root, goal_id: root }],
        [`${marker} elbow felt fine today`, { context_type: 'root', context_id: root }],
    ]) {
        const created = await page.request.post(`/api/${root}/notes`, { headers: { Authorization: `Bearer ${token}` }, data: { content, ...extra } });
        expect(created.ok()).toBeTruthy();
    }

    await page.goto(`/${root}/notes`);
    if (suffix === 'mobile') {
        // Mobile: the URL alone carries the filters.
        await page.goto(`/${root}/notes?q=${marker}&cat=goals`);
        await expect(shown(page)).toHaveText('2 notes');
        expect(await noHorizontalScroll(page)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('notes-mobile.png'), fullPage: false });
        return;
    }

    const search = page.getByRole('searchbox', { name: 'Search notes' });
    await search.fill(marker);
    await expect(page).toHaveURL(new RegExp(`q=${marker}`));
    await expect(shown(page)).toHaveText('3 notes');

    // Save "marker" as a keyword filter.
    await createFilterFromSearch(page, `Mine ${marker}`);
    await expect(page.getByRole('button', { name: `Mine ${marker}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(search).toHaveValue('');
    await expect(shown(page)).toHaveText('3 notes');

    // A second filter: goal notes where "elbow" is a whole word, built in the dialog.
    await page.getByRole('group', { name: 'Categories' }).getByRole('button', { name: 'Goals' }).click();
    await page.getByRole('button', { name: 'Create filter', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create filter' });
    await dialog.getByLabel('Name').fill(`Goal elbow ${marker}`);
    await dialog.getByLabel('Condition 1 match').selectOption('equals');
    await dialog.getByLabel('Condition 1 text').fill('elbow');
    await dialog.getByRole('button', { name: 'Create filter' }).click();
    await expect(dialog).toHaveCount(0);

    // Both active: AND.
    await expect(page.getByText('Showing notes that match all selected filters.')).toBeVisible();
    // Saved filters live in the side pane; the header names what's applied beside the count.
    await expect(page.getByRole('list', { name: 'Saved Filters' }).getByRole('listitem')).toHaveCount(2);
    await expect(page.getByLabel(/^Filtered by /)).toContainText(`Mine ${marker}`);
    await expect(page.getByRole('button', { name: 'Edit filters' })).toHaveCount(0);
    await expect(shown(page)).toHaveText('1 note');
    await page.getByRole('button', { name: `Goal elbow ${marker}`, exact: true }).click();
    await expect(shown(page)).toHaveText('3 notes');

    // Heatmap day: today holds all three new notes.
    const today = await page.evaluate(() => new Intl.DateTimeFormat('en-CA').format(new Date()));
    await page.getByRole('button', { name: new RegExp(`^${today}: \\d+ notes?$`) }).click();
    await expect(page.getByRole('button', { name: 'Show all days' })).toBeVisible();
    await expect(shown(page)).toHaveText('3 notes');

    await page.getByRole('button', { name: `Mine ${marker} options` }).click();
    const menu = await page.getByRole('menu', { name: `Mine ${marker} options` }).boundingBox();
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(page.viewportSize().width);
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(page.getByRole('button', { name: `Mine ${marker}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Show all days' })).toBeVisible();
    await expect(shown(page)).toHaveText('3 notes');
    await page.screenshot({ path: testInfo.outputPath('notes-desktop.png') });

    for (const width of [320, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await noHorizontalScroll(page)).toBe(true);
    }
});
