import { expect, test } from '@playwright/test';

import { apiToken, openOrigin } from './support/session.js';

test('circuit and round tags use activity chips and the shared catalog', async ({ page }, testInfo) => {
    await openOrigin(page);
    const token = apiToken();
    const root = `browser-circuit-tags-root-${testInfo.project.name}`;
    const { session, tag } = await page.evaluate(async ({ root, token }) => {
        const post = async (path, body) => {
            const response = await fetch(`/api/${root}/${path}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
            return response.json();
        };
        const member = await post('activities', { name: 'Circuit member' });
        const tag = await post('activity-tags', { name: 'Shared strength', color: '#123ABC' });
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
    await expect(circuitTags.getByLabel('1 tag assigned')).toHaveCount(0);
    await expect(roundTags.getByLabel('1 tag assigned')).toHaveCount(0);
    const catalog = await page.request.get(`/api/${root}/activity-tags`, { headers: { Authorization: `Bearer ${token}` } });
    expect(catalog.ok()).toBe(true);
    const matches = (await catalog.json()).tags.filter((item) => item.name === 'Shared strength');
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(tag.id);
    // Member tags sit after the activity name, like an activity instance's.
    await page.locator('[data-circuit-member-id]').first().click();
    const memberName = page.locator('[data-circuit-member-id]').first().getByText('Circuit member', { exact: true });
    const addTag = page.locator('[data-circuit-member-id]').first().getByRole('button', { name: 'Add tag' });
    await expect(addTag).toBeVisible();
    const [nameBox, tagBox] = [await memberName.boundingBox(), await addTag.boundingBox()];
    expect(tagBox.x).toBeGreaterThan(nameBox.x + nameBox.width - 1);
    expect(tagBox.x - (nameBox.x + nameBox.width)).toBeLessThan(24);
    expect(Math.abs((tagBox.y + tagBox.height / 2) - (nameBox.y + nameBox.height / 2))).toBeLessThan(tagBox.height);
    await page.screenshot({ path: testInfo.outputPath('circuit-member-tags.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test('circuit tags show by name beside a long name, and a many-tag badge lines up with the chips', async ({ page }, testInfo) => {
    await openOrigin(page);
    const token = apiToken();
    const root = `browser-circuit-tag-width-root-${testInfo.project.name}`;
    const names = ['ear-training', 'left-hand-focus', 'slow-tempo', 'metronome-on', 'fretboard-recall', 'sight-reading', 'improvisation', 'chord-melody', 'alternate-picking', 'hybrid-picking', 'string-skipping', 'position-shifts'];
    const session = await page.evaluate(async ({ root, token, names, stamp }) => {
        const post = async (path, body, method = 'POST') => {
            const response = await fetch(`/api/${root}/${path}`, {
                method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
            return response.json();
        };
        const member = await post('activities', { name: `Wide header member ${stamp}` });
        const circuit = await post('circuits', { name: 'Straddle Half Lay FL/Pike Push Up Superset', slots: [{ activity_definition_id: member.id }] });
        const session = await post('sessions', { name: 'Circuit tag width QA', goal_ids: [root], session_data: { sections: [{ name: 'Main', items: [] }] } });
        const assign = async (name, run) => post(`circuit-runs/${run.id}/tags`, { name, assigned: true }, 'PATCH');
        const single = await post(`sessions/${session.id}/circuit-runs`, { circuit_definition_id: circuit.id, section_index: 0 });
        const many = await post(`sessions/${session.id}/circuit-runs`, { circuit_definition_id: circuit.id, section_index: 0 });
        await assign(names[0], single);
        for (const name of names) await assign(name, many);
        return session;
    }, { root, token, names, stamp: Date.now() });
    await page.goto(`/${root}/session/${session.id}`);

    const groups = page.getByRole('group', { name: 'Circuit tags', exact: true });
    const single = groups.first();
    const many = groups.nth(1);
    await expect(single.getByTitle(names[0], { exact: true })).toBeVisible();

    // Selecting adds header buttons; the one tag must keep its name.
    await page.getByText('Straddle Half Lay FL/Pike Push Up Superset', { exact: true }).first().click();
    await expect(single.getByRole('button', { name: 'Add circuit tags' })).toBeVisible();
    await expect(single.getByTitle(names[0], { exact: true })).toBeVisible();
    await expect(single.getByLabel('1 tag assigned')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('circuit-tags-selected.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(single.getByTitle(names[0], { exact: true })).toBeVisible();
    await expect(single.getByLabel('1 tag assigned')).toHaveCount(0);
    const badge = many.getByLabel('12 tags assigned');
    await expect(badge).toBeVisible();
    const chipHeight = (await single.getByTitle(names[0], { exact: true }).boundingBox()).height;
    const badgeStyle = await badge.evaluate((element) => ({ height: element.getBoundingClientRect().height, align: getComputedStyle(element).alignItems }));
    expect(badgeStyle.align).toBe('center');
    expect(Math.abs(badgeStyle.height - chipHeight)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: testInfo.outputPath('circuit-tags-phone.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});
