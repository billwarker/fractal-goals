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
    // Long enough to wrap in the Goals pane, so the step number and branch alignment are exercised.
    const second = await create(`Second step, a longer goal name that wraps ${suffix}`);
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
    await dialog.getByRole('button', { name: `Add ${second.name}` }).click();
    await dialog.getByRole('button', { name: 'Create sequence' }).click();
    await expect(dialog.getByRole('button', { name: 'Options', exact: true })).toBeVisible();
    await expect.poll(() => isPaused(second)).toBe(true);
    await dialog.getByRole('button', { name: /^Close/ }).first().click();
    await expect(dialog).toHaveCount(0);

    // The hierarchy numbers the steps and says what the second waits on.
    if (suffix === 'mobile' && !(await pane.isVisible())) pane = await openPane();
    await expect(pane.getByLabel('Step 2 in sequence')).toBeVisible();
    await expect(pane.getByText(`Paused · waiting on ${first.name}`)).toBeAttached();
    if (process.env.SEQUENCE_SCREENSHOT) await pane.screenshot({ path: process.env.SEQUENCE_SCREENSHOT.replace('.png', `-pane-${suffix}.png`) });

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
    const secondNode = page.locator('.react-flow__node').filter({ hasText: second.name });
    await expect(secondNode).toBeVisible();
    await expect(secondNode.getByLabel('Step 2 in sequence')).toBeVisible();
    if (process.env.SEQUENCE_SCREENSHOT) await page.waitForTimeout(1200);
    if (process.env.SEQUENCE_SCREENSHOT) await page.screenshot({ path: process.env.SEQUENCE_SCREENSHOT.replace('.png', `-${suffix}.png`) });

    // Desktop: while Options → Sequence is open, the tree shows the siblings but not their children,
    // and a completed sibling is listed faded and can't be added.
    if (suffix === 'desktop') {
        const child = (await (await page.request.post(`/api/${root}/goals`, {
            headers, data: { name: `Child of first ${suffix}`, type: 'MidTermGoal', parent_id: first.id },
        })).json());
        const done = await create(`Done sibling ${suffix}`);
        await page.request.patch(`/api/${root}/goals/${done.id}/complete`, { headers, data: { completed: true } });
        await page.reload();
        const panel = page; // Desktop shows goal details in a side panel, not a dialog.
        // The tree fades in after a reload, so retry the click until the details panel opens.
        await expect(async () => {
            await page.locator('.react-flow__node').filter({ hasText: second.name }).getByText(second.name, { exact: true }).click();
            await expect(panel.getByRole('button', { name: 'Options', exact: true })).toBeVisible({ timeout: 2000 });
        }).toPass();
        await panel.getByRole('button', { name: 'Options', exact: true }).click();
        await panel.getByRole('button', { name: /^Sequence/ }).click();
        await expect(panel.getByRole('button', { name: `${done.name} (completed)` })).toBeDisabled();
        await expect(page.locator('.react-flow__node').filter({ hasText: first.name })).toBeVisible();
        await expect(page.locator('.react-flow__node').filter({ hasText: child.name })).toHaveCount(0);
        if (process.env.SEQUENCE_SCREENSHOT) await page.screenshot({ path: process.env.SEQUENCE_SCREENSHOT.replace('.png', '-sequencing.png') });
        // Dragging Second's card above First reorders the draft, and the tree previews it.
        const steps = panel.getByRole('list', { name: 'Sequence order' }).getByRole('listitem');
        const target = await steps.nth(0).boundingBox();
        await steps.nth(1).getByText(second.name, { exact: true }).hover();
        await page.mouse.down();
        await page.mouse.move(target.x + 20, target.y + 4, { steps: 6 });
        await page.mouse.up();
        await expect(steps.nth(0)).toContainText(second.name);
        await expect(page.locator('.react-flow__node').filter({ hasText: second.name }).getByLabel('Step 1 in sequence')).toBeVisible();
        if (process.env.SEQUENCE_SCREENSHOT) await page.screenshot({ path: process.env.SEQUENCE_SCREENSHOT.replace('.png', '-dragged.png') });
        // Saving locks the new order in: Second becomes the active step and First waits.
        await page.getByRole('button', { name: 'Save sequence', exact: true }).click();
        await expect.poll(() => isPaused(first)).toBe(true);
        await expect.poll(() => isPaused(second)).toBe(false);
        await panel.getByRole('button', { name: 'Options', exact: true }).click();
        await panel.getByRole('button', { name: /^Sequence/ }).click();
        await expect(steps.nth(0)).toContainText(second.name);
        // The tree previews the draft: removing a step drops its badge before anything is saved.
        await panel.getByRole('button', { name: `Remove ${first.name} from the sequence` }).click();
        await expect(page.locator('.react-flow__node').filter({ hasText: first.name }).getByLabel('Step 1 in sequence')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Save (ends the sequence)' })).toBeEnabled();
        expect(await isPaused(first)).toBe(true);
        if (process.env.SEQUENCE_SCREENSHOT) await page.waitForTimeout(1200);
        if (process.env.SEQUENCE_SCREENSHOT) await page.screenshot({ path: process.env.SEQUENCE_SCREENSHOT.replace('.png', '-preview.png') });
    }
    expect(errors).toEqual([]);
});
