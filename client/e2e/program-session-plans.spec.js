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
    const card = page.getByRole('article', { name: 'Bench Day plan' });
    await expect(card).toContainText('Template default');

    // Week 1: two planned sets at 100 kg.
    await card.getByRole('button', { name: '+ Add set' }).click();
    const firstWeight = card.getByLabel('Set 1 planned Weight');
    await firstWeight.fill('100');
    await firstWeight.press('Enter');
    await card.getByRole('button', { name: '+ Add set' }).click();
    await card.getByRole('button', { name: 'Save plan' }).click();
    await expect(card).toContainText('Planned');

    // Week 2 starts from week 1, showing its values as placeholders.
    await page.getByRole('button', { name: 'Next date' }).click();
    const nextCard = page.getByRole('article', { name: 'Bench Day plan' });
    await expect(nextCard).toContainText('Starts from');
    await expect(nextCard.getByLabel('Set 2 planned Weight')).toHaveAttribute('placeholder', '100');

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
});
