import { expect, test } from '@playwright/test';

test('goal heatmap shows lifetime evidence and accessible day inspection in both themes', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('fractal_timezone_preference', 'UTC');
        localStorage.setItem('theme', 'dark');
    });
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    await page.goto(`/browser-root-${suffix}/goals`);
    await page.getByText(`Heatmap Guitar ${suffix}`, { exact: true }).click();
    const heatmap = page.getByRole('region', { name: 'Timeline', exact: true });
    await expect(heatmap).toBeVisible();
    const expectMatchingBackground = async () => {
        expect(await heatmap.evaluate((element) => {
            const block = element.querySelector('[class*="_stickyCalendar_"]');
            let parent = element.closest('[class*="_panelContent_"], [class*="_modalScrollArea_"]');
            while (parent && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)') parent = parent.parentElement;
            return parent && getComputedStyle(block).backgroundColor === getComputedStyle(parent).backgroundColor;
        })).toBe(true);
    };
    await expectMatchingBackground();
    await expect(heatmap.getByText(/recorded minutes/)).toHaveCount(0);
    await heatmap.getByRole('heading', { name: 'Timeline', exact: true }).hover();
    await expect(heatmap.getByText(/4 days with recorded work · 4 completed activities/)).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Timeline', exact: true })).toHaveCount(0);
    await expect(heatmap.getByText('Showing 20 of 32 entries')).toBeAttached();
    await expect(heatmap.getByRole('region', { name: 'Activity calendar' })).toHaveCount(1);
    const accent = await heatmap.evaluate((element) => element.style.getPropertyValue('--heatmap-accent'));
    expect(accent).toMatch(/^#[0-9a-f]{6}$/i);
    const legendPeak = heatmap.locator('i[data-level="4"]');
    expect(await legendPeak.evaluate((element) => {
        const probe = document.createElement('span');
        probe.style.color = getComputedStyle(element).getPropertyValue('--heatmap-accent');
        element.append(probe);
        const matches = getComputedStyle(element).backgroundColor === getComputedStyle(probe).color;
        probe.remove();
        return matches;
    })).toBe(true);
    if (suffix === 'mobile') {
        const actions = page.getByRole('group', { name: 'Goal actions' });
        const sizes = await actions.getByRole('button').evaluateAll((buttons) => buttons.map((button) => {
            const bounds = button.getBoundingClientRect();
            return { top: bounds.top, height: bounds.height };
        }));
        expect(new Set(sizes.map((size) => size.top)).size).toBe(1);
        expect(sizes.every((size) => size.height >= 44)).toBe(true);
        expect(await actions.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('mobile-footer.png') });
        const before = await actions.boundingBox();
        await actions.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
        await expect(actions.getByRole('button').last()).toBeInViewport({ ratio: 1 });
        expect((await actions.boundingBox()).x).toBe(before.x);
        await actions.evaluate((element) => { element.scrollLeft = 0; });
    }
    const cells = heatmap.getByRole('button', { name: /^\d{4}-\d{2}-\d{2} ·/ });
    await expect(cells).toHaveCount(501);
    // Only the calendar may pan; its modal/panel ancestors retain their margins.
    const calendar = heatmap.getByRole('region', { name: 'Activity calendar' });
    const calendarScroll = calendar.locator('[class*="_scroll_"]');
    expect(await calendarScroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    const insets = await heatmap.evaluate((element) => {
        const body = element.closest('[class*="_panelContent_"], [class*="_modalScrollArea_"]');
        const content = element.getBoundingClientRect();
        const bounds = body.getBoundingClientRect();
        return { left: content.left - bounds.left, right: bounds.right - content.right };
    });
    expect(insets.left).toBeGreaterThanOrEqual(16);
    expect(insets.right).toBeGreaterThanOrEqual(16);
    const outsideScrollers = await calendarScroll.evaluate((element) => {
        const results = [];
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const overflow = getComputedStyle(parent).overflowX;
            if (['auto', 'scroll'].includes(overflow) && parent.scrollWidth > parent.clientWidth + 1) results.push(parent.className);
        }
        return results;
    });
    expect(outsideScrollers).toEqual([]);
    await calendarScroll.evaluate((element) => { element.scrollLeft = 0; });
    await calendarScroll.hover();
    const beforePan = await heatmap.boundingBox();
    await page.mouse.wheel(450, 0);
    await expect.poll(() => calendarScroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    const afterPan = await heatmap.boundingBox();
    expect(afterPan.x).toBe(beforePan.x);
    expect(afterPan.width).toBe(beforePan.width);
    await calendarScroll.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect(heatmap.getByRole('button', { name: /^(Activities|All events|Work time)$/ })).toHaveCount(0);
    await expect(heatmap.getByText('Focus or hover a day for details.')).toHaveCount(0);
    await heatmap.getByRole('heading', { name: 'Timeline', exact: true }).hover();
    const intensityLegend = heatmap.getByRole('group', { name: 'Completed activities per day' });
    await expect(intensityLegend).toBeAttached();
    const intensityBounds = await intensityLegend.boundingBox();
    const markerBounds = await heatmap.getByRole('img', { name: 'Dot: other timeline events' }).boundingBox();
    expect(Math.abs(intensityBounds.y + intensityBounds.height / 2 - markerBounds.y - markerBounds.height / 2)).toBeLessThan(2);
    expect((await heatmap.getByText(/4 days with recorded work/).boundingBox()).y).toBeGreaterThan(intensityBounds.y);
    const workDay = heatmap.locator('button[data-level="1"]').last();
    const dailySummary = heatmap.locator('[aria-live="polite"][aria-atomic="true"]');
    await expect(heatmap.getByText(/→.*UTC/)).toHaveCount(0);
    await workDay.hover();
    await expect(dailySummary).toContainText('1 completed activity');
    await heatmap.getByRole('heading', { name: 'Timeline', exact: true }).hover();
    await expect(dailySummary).toContainText('4 days with recorded work');
    await workDay.focus();
    await expect(dailySummary).toContainText('1 completed activity');
    if (suffix === 'mobile') {
        const bounds = await workDay.boundingBox();
        expect(bounds.width).toBe(20);
        expect(bounds.height).toBe(20);
        expect(await workDay.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return document.elementFromPoint(bounds.right + 1, bounds.top + bounds.height / 2)?.closest('button') === element;
        })).toBe(true);
        await page.touchscreen.tap(bounds.x + bounds.width + 1, bounds.y + bounds.height / 2);
    } else {
        await workDay.press('Enter');
    }
    await expect(heatmap.getByRole('button', { name: 'Close day' })).toBeVisible();
    await expect(heatmap.getByText('Completed activity: Guitar practice', { exact: true })).toBeVisible();
    const dayHeading = heatmap.getByRole('heading', { name: /^\d{4}-\d{2}-\d{2}$/ });
    await expect(dayHeading).toBeFocused();
    await expect(dailySummary).toContainText('1 completed activity');
    await heatmap.getByRole('button', { name: 'Close day' }).click();
    await expect(workDay).toBeFocused();
    await expect(heatmap.getByText('Showing 20 of 32 entries')).toBeAttached();
    await heatmap.getByRole('button', { name: 'Load more' }).click();
    await expect(heatmap.getByText('Showing 32 of 32 entries')).toBeAttached();
    await expect(heatmap.getByRole('button', { name: /^(Expand|Restore)$/ })).toHaveCount(0);
    const contentScroll = page.locator('[class*="_panelContent_"], [class*="_modalScrollArea_"]').first();
    await heatmap.getByText('Completed activity: Guitar practice', { exact: true }).first().scrollIntoViewIfNeeded();
    await heatmap.getByText('Completed activity: Guitar practice', { exact: true }).first().hover();
    await page.mouse.wheel(0, 400);
    const timelineHeading = heatmap.getByRole('heading', { name: 'Timeline', exact: true });
    await expect.poll(() => timelineHeading.evaluate((element) => {
        const body = element.closest('[class*="_panelContent_"], [class*="_modalScrollArea_"]');
        const goalHeader = body.querySelector('[class*="_header_"]');
        return Math.abs(element.parentElement.parentElement.getBoundingClientRect().top - goalHeader.getBoundingClientRect().bottom);
    })).toBeLessThan(2);
    await expect(calendar).toBeInViewport({ ratio: 1 });
    await expect(intensityLegend).toBeInViewport({ ratio: 1 });
    await expect(heatmap.getByRole('img', { name: 'Outline: goal paused on this day' })).toBeInViewport({ ratio: 1 });
    await expect(dailySummary).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('tab', { name: 'Details', exact: true })).toBeInViewport();
    await expect(page.getByRole('tab', { name: 'Activities', exact: true })).toBeInViewport();
    await expect(page.getByRole('tab', { name: 'Notes', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expect(heatmap.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('goal-timeline-pinned.png') });
    await contentScroll.evaluate((element) => { element.scrollTop = 0; });
    await expect(page.getByRole('tab', { name: 'Details', exact: true })).toBeInViewport();
    await expect(page.getByText('Build a steady guitar practice habit.', { exact: true })).toBeVisible();
    await expect(heatmap.getByText('Showing 32 of 32 entries')).toBeAttached();
    await calendar.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('goal-heatmap-dark.png') });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await expect(heatmap.getByRole('heading', { name: 'Timeline' })).toBeAttached();
    await expect(heatmap.getByRole('heading', { name: 'Timeline', exact: true })).toHaveCSS('color', 'rgb(15, 31, 51)');
    await expect(legendPeak).toHaveCSS('background-color', await legendPeak.evaluate((element) => {
        const probe = document.createElement('span');
        probe.style.color = getComputedStyle(element).getPropertyValue('--heatmap-accent');
        element.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
    }));
    await expectMatchingBackground();
    await page.screenshot({ path: testInfo.outputPath('goal-heatmap-light.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
    expect(errors).toEqual([]);
});
