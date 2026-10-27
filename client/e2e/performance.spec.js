import { expect, test } from '@playwright/test';

test('large session lists keep real cards available during fast scrolling and defer offscreen rendering', async ({ page }, testInfo) => {
    const root = `browser-performance-${testInfo.project.name}`;
    const details = [];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
        if (request.url().includes(`/api/${root}/sessions/${root}-session-`)) details.push(request.url());
    });
    await page.addInitScript(() => {
        window.performanceLongTasks = [];
        new PerformanceObserver((list) => window.performanceLongTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })))).observe({ type: 'longtask', buffered: true });
    });
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    const firstPage = page.waitForResponse((response) => response.url().includes(`/api/${root}/sessions?`));
    await page.goto(`/${root}/sessions`);
    const response = await firstPage;
    // Full records include both canonical metadata and the session-data snapshot.
    expect((await response.body()).byteLength).toBeLessThan(1_000_000);
    const records = (await response.json()).sessions;
    expect(records[0].attributes.private_notes).toContain('large body');
    await expect(page.getByText('Performance session 0', { exact: true })).toBeVisible();
    expect(details).toEqual([]);
    for (let index = 0; index < 5; index += 1) {
        await page.getByRole('button', { name: 'Load 10 More Sessions' }).click();
        await expect(page.locator('[data-session-window-row]')).toHaveCount((index + 2) * 10);
    }
    const rows = page.locator('[data-session-window-row]');
    await expect(rows.locator(':scope > button')).toHaveCount(0);
    await expect(rows.locator(':scope > div')).toHaveCount(60);
    // Native rendering skips offscreen cards without removing their DOM or swapping in buttons.
    await expect.poll(() => rows.evaluateAll((items) => items.filter((row) =>
        row.firstElementChild.checkVisibility({ contentVisibilityAuto: true })).length)).toBeLessThan(25);
    for (const index of [40, 5, 55, 0]) {
        const row = rows.nth(index);
        await row.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await expect(row.getByText(`Performance session ${index}`, { exact: true })).toBeVisible();
        await expect(row.locator(':scope > button')).toHaveCount(0);
        expect(await row.evaluate((element) => element.firstElementChild.checkVisibility({ contentVisibilityAuto: true }))).toBe(true);
    }
    // Focus a distant card directly: it must remain the same DOM node as selection changes.
    const distantLink = rows.nth(45).getByRole('link', { name: 'Performance session 45', exact: true });
    await distantLink.focus();
    await expect(distantLink).toBeFocused();
    expect(await rows.nth(45).evaluate((element) => getComputedStyle(element).contentVisibility)).toBe('visible');
    await page.screenshot({ path: testInfo.outputPath('sessions-after-fast-scroll.png') });
    expect(details).toEqual([]);
    await page.goto(`/${root}/goals`);
    await expect(page.getByText('Performance goal 149', { exact: true })).toBeAttached();
    let visibleGoal;
    let previousTransform;
    let stableSamples = 0;
    await expect.poll(async () => {
        const transform = await page.locator('.react-flow__viewport').getAttribute('style');
        stableSamples = transform === previousTransform ? stableSamples + 1 : 0;
        previousTransform = transform;
        if (stableSamples < 2) return undefined;
        visibleGoal = await page.locator('.react-flow__node').evaluateAll((nodes) => {
            const node = nodes.find((item) => {
                if (!/Performance goal|Browser Performance/.test(item.textContent)) return false;
                const label = item.querySelector('[class*="nodeLabel"]');
                if (!label) return false;
                const box = label.getBoundingClientRect();
                const viewport = item.closest('.react-flow').getBoundingClientRect();
                const x = box.x + box.width / 2;
                const y = box.y + box.height / 2;
                return x >= Math.max(0, viewport.x) && x <= Math.min(window.innerWidth, viewport.right)
                    && y >= Math.max(0, viewport.y) && y <= Math.min(window.innerHeight, viewport.bottom);
            });
            return node?.querySelector('[class*="nodeLabel"]')?.textContent;
        });
        return visibleGoal;
    }).toBeTruthy();
    const selectionStart = await page.evaluate(() => performance.now());
    await page.locator('.react-flow__node').getByText(visibleGoal, { exact: true }).click();
    await page.getByRole('tab', { name: 'Timeline', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Timeline', exact: true })).toBeVisible();
    const tasks = await page.evaluate((start) => window.performanceLongTasks.filter((entry) => entry.startTime >= start), selectionStart);
    expect(Math.max(0, ...tasks.map((entry) => entry.duration))).toBeLessThan(500);
    await testInfo.attach('interaction-long-tasks', { body: JSON.stringify(tasks), contentType: 'application/json' });
    expect(errors).toEqual([]);
});
