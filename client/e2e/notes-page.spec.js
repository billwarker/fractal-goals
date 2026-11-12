import { expect, test } from '@playwright/test';

import { apiToken, openOrigin } from './support/session.js';

// Tests start signed in (e2e/auth.setup.js); this puts the page on the app's origin and returns
// the API token for seeding.
async function openSignedIn(page) {
    await openOrigin(page);
    return apiToken();
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
    const token = await openSignedIn(page);
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

test('the notes timeline puts its rail, brackets and indents on the background grid', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const root = `browser-root-${suffix}`;
    // A seeded, completed session with one activity instance (scripts/browser_test_server.py).
    const sessionId = `browser-heatmap-session-${suffix}-0`;
    const instanceId = `browser-heatmap-instance-${suffix}-0`;
    const marker = `gq${Date.now().toString(36)}${suffix[0]}`;
    const token = await openSignedIn(page);
    const headers = { Authorization: `Bearer ${token}` };
    const created = [];
    const note = async (content, data) => {
        const response = await page.request.post(`/api/${root}/notes`, { headers, data: { content: `${marker} ${content}`, ...data } });
        expect(response.ok()).toBeTruthy();
        created.push((await response.json()).id);
    };
    try {
        // Newest first on the page: the activity group, then the session note, all in one session group.
        await note('session note', { context_type: 'session', context_id: sessionId, session_id: sessionId });
        await note('grouped one', { context_type: 'activity_instance', context_id: instanceId, activity_instance_id: instanceId });
        await note('grouped two', { context_type: 'activity_instance', context_id: instanceId, activity_instance_id: instanceId });

        await page.goto(`/${root}/notes?q=${marker}`);
        await expect(page.getByText(`${marker} grouped two`)).toBeVisible();
        const offsets = await page.evaluate((text) => {
            const origin = document.querySelector('.content-container').getBoundingClientRect().left;
            const x = (element) => element.getBoundingClientRect().left - origin;
            const line = (element) => x(element) + 1;  // centre of a 2px bracket
            const centre = (element) => x(element) + element.getBoundingClientRect().width / 2;
            const textOf = (content) => [...document.querySelectorAll('[class*="markdownContent"]')]
                .find((node) => node.textContent.includes(content));
            const rail = document.querySelector('[class*="_rail_"]');
            return {
                rail: x(rail) + parseFloat(getComputedStyle(rail, '::before').left) + 0.5,
                sessionBadge: x(document.querySelector('[class*="sessionHeader"]')),
                sessionBracket: line(document.querySelector('[class*="sessionNotes"]')),
                sessionNote: x(textOf(`${text} session note`)),
                activityHeader: x(document.querySelector('[class*="activityHeader"]')),
                activityBracket: line(document.querySelector('[class*="activityNotes"]')),
                groupedNote: x(textOf(`${text} grouped two`)),
                // Directory nodes centre on their parent's line: a session on the rail, an activity on its session's.
                sessionNode: centre(document.querySelector('[class*="sessionNode"]')),
                activityNode: centre(document.querySelector('[class*="activityNode"]')),
            };
        }, marker);
        const grid = 20;
        for (const [name, value] of Object.entries(offsets)) {
            const off = ((value % grid) + grid) % grid;
            expect(Math.min(off, grid - off), `${name} at ${value}px is off the ${grid}px grid`).toBeLessThanOrEqual(1);
        }
        // One grid step per level, and every note in a session group starts at the same indent.
        expect(Math.abs(offsets.sessionBracket - offsets.sessionBadge)).toBeLessThanOrEqual(1);
        expect(offsets.sessionNote - offsets.sessionBadge).toBeCloseTo(grid, 0);
        expect(offsets.activityHeader).toBeCloseTo(offsets.sessionNote, 0);
        expect(offsets.groupedNote - offsets.activityHeader).toBeCloseTo(grid, 0);
        expect(Math.abs(offsets.sessionNode - offsets.rail)).toBeLessThanOrEqual(1);
        expect(Math.abs(offsets.activityNode - offsets.sessionBracket)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: testInfo.outputPath(`notes-grid-${suffix}.png`) });
    } finally {
        for (const id of created) await page.request.delete(`/api/${root}/notes/${id}`, { headers });
    }
});
