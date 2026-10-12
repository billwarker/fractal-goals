import { expect, test } from '@playwright/test';

test('scoped instance links persist independently and builder receives the scoped goal', async ({ page }, testInfo) => {
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
    const root = `browser-adjustments-root-${suffix}`;
    const goalName = `Browser Adjustments ${suffix}`;
    const { session, definition } = await page.evaluate(async ({ root, token }) => {
        const post = async (path, body) => {
            const response = await fetch(`/api/${root}/${path}`, { method: 'POST', headers: {
                'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
            }, body: JSON.stringify(body) });
            if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
            return response.json();
        };
        const definition = await post('activities', { name: 'One-off exercise', has_metrics: false });
        const session = await post('sessions', { name: 'One-off association review', goal_ids: [root], session_data: {
            sections: [{ name: 'Work', items: [
                { type: 'activity', activity_definition_id: definition.id },
                { type: 'activity', activity_definition_id: definition.id },
            ] }],
        } });
        return { session, definition };
    }, { root, token });
    const openScope = async () => {
        if (suffix === 'mobile') await page.getByRole('button', { name: 'Details', exact: true }).click();
        await page.getByRole('button', { name: `Scope activities to ${goalName}`, exact: true }).filter({ visible: true }).click();
        if (suffix === 'mobile') await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    };
    await page.goto(`/${root}/session/${session.id}`);
    await openScope();
    const associate = page.getByRole('button', { name: `Associate with ${goalName}`, exact: true });
    await expect(associate).toHaveCount(0);
    await page.getByText('One-off exercise', { exact: true }).first().click();
    await expect(associate).toHaveCount(1);
    await expect(associate.first()).toHaveText('');
    await expect(associate.first().locator('svg')).toBeVisible();
    const hasAssociationRing = (button) => button.locator('span[aria-hidden="true"]').evaluate(
        (icon) => getComputedStyle(icon, '::after').content !== 'none',
    );
    expect(await hasAssociationRing(associate.first())).toBe(false);
    await page.getByText('One-off exercise', { exact: true }).first().click();
    const pencil = page.getByRole('button', { name: 'Edit One-off exercise', exact: true });
    const options = page.getByRole('button', { name: 'One-off exercise options', exact: true });
    await expect(pencil.locator('..').getByRole('button', { name: `Associate with ${goalName}`, exact: true })).toBeVisible();
    const goalBox = await associate.first().boundingBox();
    for (const peer of [pencil, options]) {
        const peerBox = await peer.boundingBox();
        expect(goalBox.width).toBe(peerBox.width);
        expect(goalBox.height).toBe(peerBox.height);
        expect(goalBox.y).toBe(peerBox.y);
    }
    await associate.first().focus();
    await expect(page.getByRole('tooltip')).toContainText(`Associate with ${goalName}. This instance only.`);
    await page.screenshot({ path: testInfo.outputPath('scoped-goal-icon-tooltip.png') });
    await associate.first().click();
    await expect(page.getByRole('button', { name: `Remove instance association with ${goalName}` })).toHaveCount(1);
    await expect(associate).toHaveCount(0);
    expect(await hasAssociationRing(page.getByRole('button', { name: `Remove instance association with ${goalName}` }))).toBe(true);
    await page.getByText('One-off exercise', { exact: true }).nth(1).click();
    await expect(page.getByRole('button', { name: `Remove instance association with ${goalName}` })).toHaveCount(0);
    await expect(associate).toHaveCount(1);
    expect(await hasAssociationRing(associate.first())).toBe(false);
    const completed = await page.request.put(`/api/${root}/sessions/${session.id}`, {
        headers: { Authorization: `Bearer ${token}` }, data: { completed: true },
    });
    expect(completed.ok()).toBeTruthy();
    await page.reload();
    await openScope();
    await page.getByText('One-off exercise', { exact: true }).first().click();
    await expect(page.getByRole('button', { name: `Remove instance association with ${goalName}` })).toHaveCount(1);
    await page.getByRole('button', { name: `Remove instance association with ${goalName}` }).click();
    await expect(associate).toHaveCount(1);
    expect(await hasAssociationRing(associate.first())).toBe(false);
    const definitions = await page.request.get(`/api/${root}/activities`, { headers: { Authorization: `Bearer ${token}` } });
    const original = (await definitions.json()).find((row) => row.id === definition.id);
    expect(original.associated_goal_ids || []).toEqual([]);
    const reopened = await page.request.put(`/api/${root}/sessions/${session.id}`, {
        headers: { Authorization: `Bearer ${token}` }, data: { completed: false },
    });
    expect(reopened.ok()).toBeTruthy();
    await page.reload();
    await openScope();
    await page.getByRole('button', { name: /Add Activity associated to/ }).click();
    await page.getByRole('button', { name: '+ Create New Activity Definition', exact: true }).click();
    await expect(page.getByText('Associated Goals (1)', { exact: true })).toBeVisible();
    await page.getByLabel('Activity Name').fill('Scoped definition');
    await page.getByRole('button', { name: 'Create Activity', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /Activity/ })).toHaveCount(0);
    const finalDefinitions = await page.request.get(`/api/${root}/activities`, { headers: { Authorization: `Bearer ${token}` } });
    expect((await finalDefinitions.json()).find((row) => row.name === 'Scoped definition').associated_goal_ids).toContain(root);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('scoped-instance-goals.png'), fullPage: true });
});
