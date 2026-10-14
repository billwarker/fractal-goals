import { expect, test } from '@playwright/test';

test('session hierarchy shares mobile edges and metric inputs retain usable width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One fixture checks all six viewport widths.');
    test.setTimeout(90_000);
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
    const root = 'browser-session-width-root-desktop';
    const fixture = await page.evaluate(async ({ root, token }) => {
        const post = async (path, body, method = 'POST') => {
            const response = await fetch(`/api/${root}/${path}`, {
                method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
            return response.json();
        };
        const metric = { name: 'Hands Distance from Feet', unit: 'Inches of measured distance', input_type: 'number', precision: 2 };
        const activity = await post('activities', { name: 'Pike Push Ups on the Floor', has_sets: true, has_metrics: true, metrics: [metric] });
        const splitActivity = await post('activities', {
            name: 'Advanced Tuck Front Lever Holds with Alternating Sides', has_sets: true, has_metrics: true, has_splits: true,
            metrics: [{ name: 'Hold Time with Controlled Breathing', unit: 'Seconds', input_type: 'number' }],
            splits: [{ name: 'Left side' }, { name: 'Right side' }],
        });
        const single = await post('activities', { name: 'Handstand Practice', has_metrics: true, metrics: [metric] });
        await post('activity-tags', { name: 'Long strength and mobility tag', color: '#123ABC', scope: 'selected', activity_ids: [activity.id] });
        const tagged = await (await fetch(`/api/${root}/activities`, {
            headers: { Authorization: `Bearer ${token}` },
        })).json();
        const tagId = tagged.find((definition) => definition.id === activity.id).tags[0].id;
        const entries = (definition) => definition.metric_definitions.flatMap((m) => definition.has_splits
            ? definition.split_definitions.map((split) => ({ metric_id: m.id, split_id: split.id, value: 18 }))
            : [{ metric_id: m.id, value: 36 }]);
        const circuit = await post('circuits', { name: 'Advanced Tuck FL / Pike Push Up Superset', slots: [
            { activity_definition_id: activity.id }, { activity_definition_id: splitActivity.id },
        ] });
        const template = await post('session-templates', { name: 'Mobile width fixture', template_data: {
            session_type: 'normal', sections: [{ name: 'Exercises and Mobility', items: [
                { type: 'activity', activity_definition_id: single.id, item_key: 'single', prescription: { metrics: entries(single) } },
                { type: 'activity', activity_definition_id: activity.id, item_key: 'sets', prescription: {
                    sets: [{ metrics: entries(activity), tags: [tagId] }, { metrics: entries(activity) }],
                } },
                { type: 'activity', activity_definition_id: splitActivity.id, item_key: 'splits', prescription: {
                    sets: [{ metrics: entries(splitActivity) }],
                } },
                { type: 'circuit', circuit_definition_id: circuit.id, item_key: 'circuit', prescription: {
                    rounds: Array.from({ length: 3 }, () => ({ slots: circuit.slots.map((slot, index) => ({
                        slot_id: slot.id, metrics: entries(index === 0 ? activity : splitActivity),
                    })) })),
                } },
            ] }],
        } });
        const previous = await post('sessions', { name: 'Previous handstand results', goal_ids: [root], session_data: {
            sections: [{ name: 'Practice', items: [{ type: 'activity', activity_definition_id: single.id }] }],
        } });
        const previousInstances = await (await fetch(`/api/${root}/sessions/${previous.id}/activities`, {
            headers: { Authorization: `Bearer ${token}` },
        })).json();
        await post(`sessions/${previous.id}/activities/${previousInstances[0].id}/metrics`, { metrics: entries(single) }, 'PUT');
        await post(`activity-instances/${previousInstances[0].id}/complete`, {});
        await post(`sessions/${previous.id}`, { completed: true }, 'PUT');
        const session = await post('sessions', { name: 'Mobile width review', template_id: template.id, goal_ids: [root] });
        return { sessionId: session.id };
    }, { root, token });
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.goto(`/${root}/session/${fixture.sessionId}`);
    const workspace = page.locator('[data-session-detail-content]');
    await expect(workspace.getByText('Round 3', { exact: true })).toBeVisible();
    await expect(workspace.getByText('(plan 36)', { exact: true }).first()).toBeVisible();
    const singleMetric = workspace.locator('[class*="metricInput_"]').first();
    await singleMetric.fill('40');
    await singleMetric.press('Enter');
    await expect(workspace.getByText('(last 36)', { exact: true })).toBeVisible();
    for (const width of [320, 375, 390, 768, 769, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(async () => {
            const layout = await workspace.evaluate((element) => {
                const rect = (node) => node.getBoundingClientRect();
                const structural = [...element.querySelectorAll('[class*="activityCard_"]')];
                const inputs = [...element.querySelectorAll('[class*="metricInput_"]')];
                const metrics = [...element.querySelectorAll('[class*="metricInputContainer_"]')];
                return {
                    pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
                    overflow: [element, ...structural, ...metrics].filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => ({ className: node.className, width: node.clientWidth, scrollWidth: node.scrollWidth, viewport: innerWidth })),
                    inputWidths: inputs.map((node) => rect(node).width),
                    padding: structural.map((node) => getComputedStyle(node).paddingLeft),
                    edges: structural.map((node) => ({ left: rect(node).left, width: rect(node).width })),
                    timerRows: [...element.querySelectorAll('[class*="timerMetaColumn_"]')].map((row) => [...row.children].map((field) => {
                        const control = field.querySelector('input, [class*="durationDisplay_"]');
                        const bounds = control.getBoundingClientRect();
                        return { x: bounds.x, y: bounds.y, right: bounds.right, width: bounds.width, height: bounds.height };
                    })),
                    memberHeaders: [...element.querySelectorAll('[class*="memberHeader_"]')].map((header) => ({
                        left: rect(header).left + parseFloat(getComputedStyle(header).paddingLeft), identityLeft: rect(header.firstElementChild).left,
                    })),
                    metricRows: metrics.map((row) => {
                        const field = row.querySelector('input, select');
                        const meta = row.querySelector('[class*="metricMeta_"]') || row.querySelector('[class*="metricMetaLarge_"]');
                        const label = row.querySelector('label');
                        const unit = meta.firstElementChild;
                        const hints = row.querySelector('[class*="metricHints_"]');
                        return { fieldLeft: rect(field).left, fieldRight: rect(field).right, fieldTop: rect(field).top,
                            fieldHeight: rect(field).height, hintTop: rect(hints).top, hintDisplay: getComputedStyle(hints).display,
                            labelDisplay: getComputedStyle(label).display, labelRight: rect(label).right, unitLeft: rect(unit).left, unitMiddle: rect(unit).top + rect(unit).height / 2, fieldMiddle: rect(field).top + rect(field).height / 2 };
                    }),
                    headerPadding: getComputedStyle(element.querySelector('[class*="activityHeader_"]')).paddingRight,
                };
            });
            expect(layout.pageOverflow).toBe(false);
            expect(layout.overflow).toEqual([]);
            expect(layout.inputWidths.length).toBeGreaterThan(10);
            if (width <= 768) {
                expect(layout.inputWidths.every((value) => value >= 96)).toBe(true);
                expect(new Set(layout.padding)).toEqual(new Set(['0px']));
                expect(Math.max(...layout.edges.map((edge) => edge.left)) - Math.min(...layout.edges.map((edge) => edge.left))).toBeLessThanOrEqual(1);
                expect(Math.max(...layout.edges.map((edge) => edge.width)) - Math.min(...layout.edges.map((edge) => edge.width))).toBeLessThanOrEqual(1);
                expect(layout.headerPadding).toBe('8px');
                for (const header of layout.memberHeaders) {
                    expect(header.identityLeft).toBe(header.left);
                }
                for (const row of layout.metricRows) {
                    expect(row.labelRight).toBeLessThanOrEqual(row.fieldLeft);
                    expect(row.fieldRight).toBeLessThanOrEqual(row.unitLeft);
                    expect(Math.abs(row.unitMiddle - row.fieldMiddle)).toBeLessThanOrEqual(1);
                    if (row.hintDisplay !== 'none') {
                        expect(row.hintTop).toBeGreaterThanOrEqual(row.fieldTop + row.fieldHeight);
                    }
                    expect(row.labelDisplay).not.toBe('none');
                }
                expect(layout.timerRows.length).toBe(4);
                for (const fields of layout.timerRows) {
                    expect(fields).toHaveLength(3);
                    expect(new Set(fields.map((field) => field.y)).size).toBe(1);
                    expect(fields[0].right).toBeLessThanOrEqual(fields[1].x);
                    expect(fields[1].right).toBeLessThanOrEqual(fields[2].x);
                    expect(fields[2].width).toBeGreaterThanOrEqual(64);
                    expect(fields.every((field) => field.height === 36)).toBe(true);
                }
            } else {
                expect(layout.padding[0]).toBe('16px');
                expect(layout.headerPadding).toBe('30px');
            }
        }).toPass({ timeout: 5000 });
        await page.screenshot({ path: testInfo.outputPath(`session-width-${width}.png`), fullPage: true });
        if (width <= 768) {
            await workspace.locator('[class*="memberCard_"]').first().screenshot({ path: testInfo.outputPath(`circuit-width-${width}.png`) });
        }
    }
    await page.setViewportSize({ width: 320, height: 900 });
    const circuitMetrics = workspace.getByLabel('Pike Push Ups on the Floor metrics', { exact: true });
    const input = circuitMetrics.first().locator('input');
    const member = circuitMetrics.first().locator('..');
    await member.getByText('Pike Push Ups on the Floor', { exact: true }).click();
    const perimeter = await member.evaluate((element) => {
        const overlay = getComputedStyle(element, '::after');
        return { content: overlay.content, zIndex: overlay.zIndex, pointerEvents: overlay.pointerEvents,
            inset: [overlay.top, overlay.right, overlay.bottom, overlay.left], shadow: overlay.boxShadow };
    });
    expect(perimeter).toMatchObject({ content: '""', zIndex: '2', pointerEvents: 'none', inset: ['0px', '0px', '0px', '0px'] });
    expect(perimeter.shadow).toContain('inset');
    const selectedScreenshot = await member.screenshot({ path: testInfo.outputPath('selected-member-perimeter.png') });
    // Check painted pixels, not just the overlay declaration: child metric backgrounds
    // must leave a continuous accent on both sides of the selected member.
    const perimeterPixels = await member.evaluate(async (element, base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.fillStyle = getComputedStyle(element).getPropertyValue('--color-brand-success').trim();
        context.fillRect(0, 0, 1, 1);
        const accent = context.getImageData(0, 0, 1, 1).data;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const isAccent = (x, y) => [0, 1, 2].every((channel) => (
            Math.abs(pixels[(y * canvas.width + x) * 4 + channel] - accent[channel]) <= 20
        ));
        const missing = [];
        for (let y = 3; y < canvas.height - 3; y++) {
            if (![0, 1].some((x) => isAccent(x, y))
                || ![canvas.width - 1, canvas.width - 2].some((x) => isAccent(x, y))) missing.push(y);
        }
        for (let x = 3; x < canvas.width - 3; x++) {
            if (![0, 1, 2].some((y) => isAccent(x, y))
                || ![canvas.height - 1, canvas.height - 2, canvas.height - 3].some((y) => isAccent(x, y))) missing.push(`horizontal-${x}`);
        }
        return missing;
    }, selectedScreenshot.toString('base64'));
    expect(perimeterPixels).toEqual([]);
    await input.fill('32');
    await input.press('Enter');
    const cascade = circuitMetrics.first().getByRole('button', { name: /Cascade/ });
    await expect(cascade).toBeVisible();
    await cascade.click();
    await expect(circuitMetrics.nth(1).locator('input')).toHaveValue('32.00');
    const note = workspace.getByPlaceholder(/Add a note/).last();
    await note.fill('Full-width selection keeps controls usable.');
    await note.press('Enter');
    await expect(workspace.getByText('Full-width selection keeps controls usable.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(workspace.getByLabel('Pike Push Ups on the Floor metrics', { exact: true }).first().locator('input')).toHaveValue('32.00');
    await workspace.getByText('Round 1', { exact: true }).click();
    await expect(workspace.getByRole('group', { name: 'Round 1 tags', exact: true }).getByRole('button', { name: 'Add round 1 tags' })).toBeVisible();
    const set = workspace.locator('[class*="setRow_"]').first();
    const setWidth = (await set.boundingBox()).width;
    await set.getByText('#1', { exact: true }).click();
    expect(await set.evaluate((element) => getComputedStyle(element, '::after').pointerEvents)).toBe('none');
    expect((await set.boundingBox()).width).toBe(setWidth);
    await workspace.getByRole('button', { name: 'Complete circuit', exact: true }).click();
    await expect(workspace.getByRole('status').filter({ hasText: 'Completed' })).toBeVisible();
    expect(await workspace.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
    expect(errors).toEqual([]);
});
