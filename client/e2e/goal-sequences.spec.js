import { expect, test } from '@playwright/test';

async function logIn(page) {
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    const login = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    const { token } = await (await login).json();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    return token;
}

// Uses the "Browser Planning" fractal: its program's goal is the fractal root.
test('sequences sibling goals, then begins and re-pauses the next one through completion', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const root = `browser-plan-root-${suffix}`;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('fractal_timezone_preference', 'UTC'));
    const headers = { Authorization: `Bearer ${await logIn(page)}` };
    const create = async (name) => {
        const response = await page.request.post(`/api/${root}/goals`, { headers, data: { name, type: 'LongTermGoal', parent_id: root } });
        expect(response.ok(), await response.text()).toBeTruthy();
        return response.json();
    };
    const first = await create(`First step ${suffix}`);
    const second = await create(`Second step ${suffix}`);
    const isPaused = async (goal) => (await (await page.request.get(`/api/${root}/goals/${goal.id}`, { headers })).json()).paused;

    await page.goto(`/${root}/programs`);
    const openPane = async () => {
        if (suffix === 'mobile') await page.getByRole('button', { name: 'Show Sidebar' }).click();
        const pane = page.getByRole('complementary', { name: 'Program side pane', exact: true });
        await pane.getByRole('tab', { name: 'Goals' }).click();
        return pane;
    };
    let pane = await openPane();

    // Options → Sequence: add the sibling and create the sequence.
    await pane.getByText(first.name, { exact: true }).click();
    let dialog = page.getByRole('dialog', { name: first.name });
    await dialog.getByRole('button', { name: 'Options', exact: true }).click();
    await dialog.getByRole('button', { name: /^Sequence/ }).click();
    await dialog.getByRole('button', { name: `+ ${second.name}` }).click();
    await dialog.getByRole('button', { name: 'Create sequence' }).click();
    await expect(dialog.getByRole('button', { name: 'Options', exact: true })).toBeVisible();
    await expect.poll(() => isPaused(second)).toBe(true);
    await dialog.getByRole('button', { name: /^Close/ }).first().click();
    await expect(dialog).toHaveCount(0);

    // The hierarchy numbers the steps and says what the second waits on.
    if (suffix === 'mobile' && !(await pane.isVisible())) pane = await openPane();
    await expect(pane.getByLabel('Step 2 in sequence')).toBeVisible();
    await expect(pane.getByText(`Paused · waiting on ${first.name}`)).toBeAttached();

    // Completing the first step begins the second (checked by default)…
    await pane.getByText(first.name, { exact: true }).click();
    dialog = page.getByRole('dialog', { name: first.name });
    await dialog.getByRole('button', { name: 'Mark Complete' }).click();
    await expect(dialog.getByRole('checkbox', { name: new RegExp(`Begin next goal in sequence: ${second.name}`) })).toBeChecked();
    await dialog.getByRole('button', { name: 'Complete Goal' }).click();
    await expect.poll(() => isPaused(second)).toBe(false);

    // …and un-completing it pauses the second again.
    await dialog.getByRole('button', { name: 'Mark Incomplete' }).click();
    await expect(dialog.getByRole('checkbox', { name: new RegExp(`Pause next goal in sequence: ${second.name} again`) })).toBeChecked();
    await dialog.getByRole('button', { name: 'Mark Incomplete' }).last().click();
    await expect.poll(() => isPaused(second)).toBe(true);

    // The goal flow tree links the steps with one dashed arrow.
    await page.goto(`/${root}/goals`);
    // Mobile opens the Goals page in hierarchy layout, where step numbers show order instead.
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Tree', exact: true }).click();
    await expect(page.locator('.react-flow__edge.sequence-edge')).toHaveCount(1);
    await expect(page.locator('.react-flow__node').filter({ hasText: second.name })).toBeVisible();
    if (process.env.SEQUENCE_SCREENSHOT) await page.waitForTimeout(1200);
    if (process.env.SEQUENCE_SCREENSHOT) await page.screenshot({ path: process.env.SEQUENCE_SCREENSHOT.replace('.png', `-${suffix}.png`) });
    expect(errors).toEqual([]);
});
