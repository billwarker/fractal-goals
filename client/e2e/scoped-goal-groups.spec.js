import { expect, test } from '@playwright/test';

test("scoped creation joins the goal's group; one-off links show on cards and in the picker", async ({ page }, testInfo) => {
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
    const root = `browser-scoped-groups-root-${suffix}`;
    const goalName = `Browser Scoped Groups ${suffix}`;
    const auth = { Authorization: `Bearer ${token}` };

    const { session, songs, scales } = await page.evaluate(async ({ root, token }) => {
        const post = async (path, body) => {
            const response = await fetch(`/api/${root}/${path}`, { method: 'POST', headers: {
                'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
            }, body: body ? JSON.stringify(body) : undefined });
            if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
            return response.json();
        };
        const songs = await post('activity-groups', { name: 'Songs' });
        const scales = await post('activity-groups', { name: 'Scales' });
        await post(`goals/${root}/activity-groups/${songs.id}`);
        await post('activities', { name: 'Practice Octave Shapes', has_metrics: false, group_id: songs.id });
        const melody = await post('activities', { name: 'Intro melody', has_metrics: false, group_id: scales.id });
        const session = await post('sessions', { name: 'Scoped groups review', goal_ids: [root], session_data: {
            sections: [{ name: 'Work', items: [{ type: 'activity', activity_definition_id: melody.id }] }],
        } });
        return { session, songs, scales };
    }, { root, token });

    // A goal has one activity group: a second one is refused until replaced.
    const second = await page.request.post(`/api/${root}/goals/${root}/activity-groups/${scales.id}`, { headers: auth });
    expect(second.status()).toBe(409);
    expect((await second.json()).code).toBe('goal_activity_group_taken');

    const openScope = async () => {
        if (suffix === 'mobile') await page.getByRole('button', { name: 'Details', exact: true }).click();
        await page.getByRole('button', { name: `Scope activities to ${goalName}`, exact: true }).filter({ visible: true }).click();
        if (suffix === 'mobile') await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    };
    const linkedIcon = page.getByRole('listitem', { name: `Linked to ${goalName} (this instance only)` });
    const oneOffRow = page.getByRole('button').filter({ hasText: 'One-off link' });

    await page.goto(`/${root}/session/${session.id}`);
    await openScope();
    await expect(linkedIcon).toHaveCount(0);

    await page.getByRole('button', { name: /Add Activity associated to/ }).click();
    await expect(page.getByRole('button').filter({ hasText: 'Practice Octave Shapes' }).first()).toBeVisible();
    await expect(oneOffRow).toHaveCount(0);
    await page.getByRole('button', { name: 'Close activity picker', exact: true }).click();

    await page.getByText('Intro melody', { exact: true }).first().click();
    await page.getByRole('button', { name: `Associate with ${goalName}`, exact: true }).click();
    await expect(page.getByRole('button', { name: `Remove instance association with ${goalName}` })).toHaveCount(1);
    await expect(linkedIcon).toHaveCount(1);

    // The icon stays without scope or selection, including after a reload.
    await page.reload();
    await expect(linkedIcon).toHaveCount(1);
    await linkedIcon.focus();
    await expect(page.getByRole('tooltip')).toContainText(`Linked to ${goalName} (this instance only)`);

    await openScope();
    await page.getByRole('button', { name: /Add Activity associated to/ }).click();
    await expect(oneOffRow).toHaveCount(1);
    await expect(oneOffRow).toContainText('Intro melody');
    await page.screenshot({ path: testInfo.outputPath('scoped-picker-one-off.png') });

    await page.getByRole('button', { name: '+ Create New Activity Definition', exact: true }).click();
    await expect(page.getByLabel('Activity Group')).toHaveValue(songs.id);
    await expect(page.getByText(`From ${goalName}'s activity group`, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('scoped-builder-group.png') });
    await page.getByLabel('Activity Name').fill('Scoped riff');
    await page.getByRole('button', { name: 'Create Activity', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /Activity/ })).toHaveCount(0);
    const definitions = await (await page.request.get(`/api/${root}/activities`, { headers: auth })).json();
    const created = definitions.find((row) => row.name === 'Scoped riff');
    expect(created.group_id).toBe(songs.id);
    expect(created.associated_goal_ids).toContain(root);

    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('scoped-groups.png'), fullPage: true });
});
