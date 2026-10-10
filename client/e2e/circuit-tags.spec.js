import { expect, test } from '@playwright/test';

test('circuit and round tags use activity chips and the shared catalog', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    const login = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    const { token } = await (await login).json();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    const root = `browser-adjustments-root-${testInfo.project.name}`;
    const { session, tag } = await page.evaluate(async ({ root, token }) => {
        const post = async (path, body) => {
            const response = await fetch(`/api/${root}/${path}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
            return response.json();
        };
        const unrelated = await post('activities', { name: 'Catalog source' });
        const member = await post('activities', { name: 'Circuit member' });
        const tag = await post('activity-tags', { name: 'Shared strength', color: '#123ABC', scope: 'selected', activity_ids: [unrelated.id] });
        const circuit = await post('circuits', { name: 'Shared tag circuit', slots: [{ activity_definition_id: member.id }] });
        const session = await post('sessions', { name: 'Circuit tags browser QA', goal_ids: [root], session_data: { sections: [{ name: 'Main', items: [] }] } });
        await post(`sessions/${session.id}/circuit-runs`, { circuit_definition_id: circuit.id, section_index: 0 });
        return { session, tag };
    }, { root, token });
    await page.goto(`/${root}/session/${session.id}`);
    await page.getByText('Shared tag circuit', { exact: true }).click();
    const circuitTags = page.getByRole('group', { name: 'Circuit tags', exact: true });
    await circuitTags.getByRole('button', { name: 'Add circuit tags' }).click();
    await page.getByRole('dialog', { name: 'Choose circuit tags' }).getByText('Shared strength', { exact: true }).click();
    await expect(circuitTags.getByTitle('Shared strength', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close tag picker' }).click();
    const chip = circuitTags.getByTitle('Shared strength', { exact: true });
    const style = await chip.evaluate((element) => {
        const css = getComputedStyle(element);
        const input = element.querySelector('input');
        return { radius: css.borderRadius, size: css.fontSize, opacity: input ? getComputedStyle(input).opacity : '0' };
    });
    expect(style).toEqual({ radius: '999px', size: '11px', opacity: '0' });
    await page.getByText('Round 1', { exact: true }).click();
    const roundTags = page.getByRole('group', { name: 'Round 1 tags', exact: true });
    await roundTags.getByRole('button', { name: 'Add round 1 tags' }).click();
    await page.getByRole('dialog', { name: 'Choose round 1 tags' }).getByText('Shared strength', { exact: true }).click();
    await expect(roundTags.getByTitle('Shared strength', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close tag picker' }).click();
    await page.reload();
    await expect(circuitTags.getByTitle('Shared strength', { exact: true })).toBeVisible();
    await expect(roundTags.getByTitle('Shared strength', { exact: true })).toBeVisible();
    const catalog = await page.request.get(`/api/${root}/activity-tags`, { headers: { Authorization: `Bearer ${token}` } });
    expect(catalog.ok()).toBe(true);
    const matches = (await catalog.json()).tags.filter((item) => item.name === 'Shared strength');
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(tag.id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});
