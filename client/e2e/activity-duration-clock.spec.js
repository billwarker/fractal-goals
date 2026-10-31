import { expect, test } from '@playwright/test';

const toSeconds = (text) => {
    const parts = text.trim().split(':').map(Number);
    if (parts.some(Number.isNaN)) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
};

test('the session Activity clock runs with an activity timer and follows resets', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    const login = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    const { token } = await (await login).json();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    const suffix = testInfo.project.name;
    const root = `browser-activity-clock-root-${suffix}`;
    const session = await page.evaluate(async ({ root, token }) => {
        const post = async (path, body) => {
            const response = await fetch(`/api/${root}/${path}`, { method: 'POST', headers: {
                'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
            }, body: JSON.stringify(body) });
            if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
            return response.json();
        };
        const definition = await post('activities', { name: 'Clocked drill', has_metrics: false });
        return post('sessions', { name: 'Activity clock review', goal_ids: [root], session_data: {
            sections: [{ name: 'Work', items: [{ type: 'activity', activity_definition_id: definition.id }] }],
        } });
    }, { root, token });

    await page.goto(`/${root}/session/${session.id}`);
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Details', exact: true }).click();
    const activityClock = page.getByText('Activity', { exact: true }).filter({ visible: true }).first().locator('xpath=following-sibling::*[1]');
    await expect(activityClock).toHaveText('—');
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Close panel', exact: true }).click();

    await page.getByTitle('Start timer').first().click();
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(activityClock).not.toHaveText('—', { timeout: 5000 });
    const first = toSeconds(await activityClock.textContent());
    await expect.poll(async () => toSeconds(await activityClock.textContent()), { timeout: 5000 }).toBeGreaterThan(first);
    if (suffix === 'desktop') {
        // Card and total read the shared clock: with one activity they match on every tick.
        const card = page.locator('label', { hasText: /^Duration$/ }).locator('xpath=following-sibling::div[1]').first();
        const [cardHandle, totalHandle] = [await card.elementHandle(), await activityClock.elementHandle()];
        for (let sample = 0; sample < 8; sample += 1) {
            const [cardText, totalText] = await page.evaluate(
                ([cardElement, totalElement]) => [cardElement.textContent, totalElement.textContent],
                [cardHandle, totalHandle],
            );
            expect(toSeconds(totalText)).toBe(toSeconds(cardText));
            await page.waitForTimeout(370);
        }
    }
    await page.screenshot({ path: testInfo.outputPath('activity-clock-running.png') });
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Close panel', exact: true }).click();

    await page.getByTitle('Reset timer').first().click();
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(activityClock).toHaveText('—');
    expect(errors).toEqual([]);
});
