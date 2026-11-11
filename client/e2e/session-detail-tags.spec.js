import { expect, test } from '@playwright/test';

import { apiToken, openOrigin } from './support/session.js';

test('activity instance tags show by name, and collapse only when they outgrow two rows', async ({ page }, testInfo) => {
    await openOrigin(page);
    const token = apiToken();
    const root = `browser-session-tags-root-${testInfo.project.name}`;
    const session = await page.evaluate(async ({ root, token }) => {
        const post = async (path, body, method = 'POST') => {
            const response = await fetch(`/api/${root}/${path}`, {
                method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
            return response.json();
        };
        const tagNames = ['ear-training', 'left-hand-focus', 'slow-tempo', 'metronome-on', 'fretboard-recall', 'sight-reading', 'improvisation', 'rhythm-work', 'chord-tones', 'arpeggio-drill', 'position-shifts', 'dynamics'];
        const tags = [];
        for (const name of tagNames) tags.push(await post('activity-tags', { name, color: '#123ABC' }));
        const one = await post('activities', { name: 'Single tag practice', has_sets: false, has_metrics: false });
        const many = await post('activities', { name: 'Many tags practice', has_sets: false, has_metrics: false });
        const session = await post('sessions', { name: 'Tag display QA', goal_ids: [root], session_data: { sections: [{ name: 'Main', items: [] }] } });
        const add = (definition) => post(`sessions/${session.id}/activities`, { activity_definition_id: definition.id, section_index: 0 });
        const first = await add(one);
        const second = await add(many);
        const assign = (instance, ids) => post(`activity-instances/${instance.id}/tags`, { tag_ids: ids, version: instance.tag_assignment_version }, 'PUT');
        await assign(first, [tags[0].id]);
        await assign(second, tags.map((tag) => tag.id));
        return session;
    }, { root, token });
    await page.goto(`/${root}/session/${session.id}`);

    const singleCard = page.locator('[data-tag-width-boundary]').filter({ hasText: 'Single tag practice' });
    const manyCard = page.locator('[data-tag-width-boundary]').filter({ hasText: 'Many tags practice' });
    await expect(singleCard.getByText('ear-training', { exact: true }).first()).toBeVisible();

    // Selecting adds header buttons; the one tag must keep its name.
    await singleCard.getByText('Single tag practice').click();
    await expect(singleCard.getByText('ear-training', { exact: true }).first()).toBeVisible();
    await expect(singleCard.getByLabel('1 tag assigned')).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(singleCard.getByText('ear-training', { exact: true }).first()).toBeVisible();
    await expect(singleCard.getByLabel('1 tag assigned')).toHaveCount(0);
    await expect(manyCard.getByLabel('12 tags assigned')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
});
