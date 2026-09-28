import { expect, test } from '@playwright/test';

// Uses the "Browser Planning" fractal: a weekly "Upper A" day on today's weekday with a
// set-based "Bench Day" template, and no active session.
test('program a dated plan, seed the next week from it, and see it in the session', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const rootId = `browser-plan-root-${suffix}`;
    const today = new Date().toISOString().slice(0, 10);
    await page.addInitScript(() => localStorage.setItem('fractal_timezone_preference', 'UTC'));
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();

    await page.goto(`/${rootId}/programs`);
    await page.getByRole('tab', { name: 'Days' }).click();
    // Today is the latest program day; next week's sits beside it.
    const cards = page.getByRole('article', { name: /^Bench Day plan/ });
    await expect(cards).toHaveCount(2);
    const card = cards.first();
    await expect(card).toContainText('Template default');
    const benchKey = `[data-align-key*="|a:browser-plan-bench-${suffix}#0"]`;
    const bench = card.locator(benchKey);

    // Week 1: two planned sets at 100 kg.
    await bench.getByRole('button', { name: '+ Add set' }).click();
    const firstWeight = bench.getByLabel('Set 1 planned Weight');
    await firstWeight.fill('100');
    await firstWeight.press('Enter');
    await bench.getByRole('button', { name: '+ Add set' }).click();

    // Picking a set scopes the note and tags to it: its highlight stays inside the set table
    // (nothing clipped), and its tag button sits just left of its remove button.
    await bench.getByRole('button', { name: 'Set 1', exact: true }).click();
    await expect(bench.getByLabel('Note for Bench Press · Set 1')).toBeVisible();
    const [table, selectedSet, setTag, setRemove] = await Promise.all([
        bench.getByRole('group', { name: 'Planned sets' }),
        bench.locator('[data-scope-row][data-selected="true"]'),
        bench.getByRole('group', { name: 'Set tags' }).getByRole('button', { name: 'Add tag' }),
        bench.getByRole('button', { name: 'Remove planned set 1' }),
    ].map((locator) => locator.boundingBox()));
    expect(selectedSet.x).toBeGreaterThanOrEqual(table.x);
    expect(selectedSet.x + selectedSet.width).toBeLessThanOrEqual(table.x + table.width + 0.5);
    expect(setTag.x + setTag.width).toBeLessThanOrEqual(setRemove.x);
    expect(Math.abs((setTag.y + setTag.height / 2) - (setRemove.y + setRemove.height / 2))).toBeLessThanOrEqual(2);
    // Clicking the activity's own container scopes back to the whole activity.
    await bench.getByText('Bench Press', { exact: true }).click();
    await expect(bench.getByLabel('Coaching note for Bench Press')).toBeVisible();

    await card.getByRole('button', { name: 'Save plan' }).click();
    await expect(card).toContainText('Planned');

    // Next week, in the neighbouring column, now starts from week 1 with its values as placeholders.
    const nextCard = cards.nth(1);
    await expect(nextCard).toContainText('Starts from');
    await expect(nextCard.locator(benchKey).getByLabel('Set 2 planned Weight')).toHaveAttribute('placeholder', '100');

    if (suffix === 'desktop') {
        // A third set on next week's Bench Press makes that card taller; the Barbell Row rows
        // below still line up side by side.
        await nextCard.locator(benchKey).getByRole('button', { name: '+ Add set' }).click();
        const rowKey = `[data-align-key*="|a:browser-plan-row-${suffix}#0"]`;
        await expect(async () => {
            const [left, right] = await Promise.all([card, nextCard].map((plan) => plan.locator(rowKey).boundingBox()));
            expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(1);
        }).toPass();
        await nextCard.getByRole('button', { name: 'Discard' }).click();
    }


    // Today's session executes the plan; the planned value is a reference beside the input.
    await page.goto(
        `/${rootId}/create-session?program_id=browser-plan-program-${suffix}`
        + `&program_day_id=browser-plan-day-${suffix}&date=${today}&template_id=browser-plan-template-${suffix}`,
    );
    await page.getByRole('button', { name: 'Create Session' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/${rootId}/session/`));
    const planChips = page.getByText('plan 100', { exact: true });
    await expect(planChips).toHaveCount(2);

    const weightInput = page.locator('input[inputmode="decimal"]').first();
    await weightInput.fill('95');
    await weightInput.press('Enter');
    // Set 1 is now under plan; set 2 is still waiting for a value.
    await expect(page.getByTitle('Planned 100 · under plan')).toHaveCount(1);
    await expect(page.getByTitle('Planned 100', { exact: true })).toHaveCount(1);

    // Back on the Days tab, today's template shows the session that is completing it, as on
    // the Sessions page, beside next week's plan.
    if (suffix === 'desktop') {
        await page.goto(`/${rootId}/programs`);
        await page.getByRole('tab', { name: 'Days' }).click();
        const sessionCard = page.getByRole('article', { name: 'Bench Day session' });
        const nextPlan = page.getByRole('article', { name: /^Bench Day plan/ });
        await expect(sessionCard).toHaveCount(1);
        await expect(nextPlan).toHaveCount(1);
        // The session's Barbell Row lines up with the same activity in next week's plan.
        const rowKey = `[data-align-key*="|a:browser-plan-row-${suffix}#0"]`;
        await expect(async () => {
            const [left, right] = await Promise.all([sessionCard, nextPlan].map((card) => card.locator(rowKey).boundingBox()));
            expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(1);
        }).toPass();
    }
});
