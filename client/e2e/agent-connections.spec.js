import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('AI connection settings are keyboard accessible and revoke delegated grants', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText(`Browser Practice ${suffix}`).first()).toBeVisible();
    await page.goto(`/browser-root-${suffix}/goals`);

    const settingsButton = page.getByRole('button', { name: 'SETTINGS', exact: true });
    await settingsButton.focus();
    await settingsButton.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    const connectionsButton = dialog.getByRole('button', { name: 'AI Connections', exact: true });
    await connectionsButton.focus();
    await connectionsButton.press('Enter');
    await expect(connectionsButton).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('heading', { name: 'Connected services' })).toBeVisible();
    const connection = dialog.locator('article').filter({ hasText: `Browser AI Settings ${suffix}` });
    await expect(connection).toBeVisible();

    const revokeButton = connection.getByRole('button', { name: 'Revoke', exact: true });
    await revokeButton.focus();
    await revokeButton.press('Enter');
    await expect(connection).toHaveCount(0);
    await expect(dialog.getByRole('alert')).toHaveCount(0);

    const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
    expect(errors).toEqual([]);
});

test('AI handoff, delegated proposal, keyboard review, worker execution, refresh, cancellation, and reload work end to end', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const suffix = testInfo.project.name;
    const rootId = `browser-root-${suffix}`;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText(`Browser Practice ${suffix}`).first()).toBeVisible();
    await page.goto(`/${rootId}/goals`);

    const askAi = page.getByRole('button', { name: 'ASK AI', exact: true });
    await askAi.focus();
    await askAi.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Fractal AI' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'false');
    const providerSelect = dialog.getByLabel('Connected provider');
    await expect(providerSelect).toBeEnabled();
    await providerSelect.selectOption(`browser-agent-grant-${suffix}`);

    const createTask = async (request) => {
        const responsePromise = page.waitForResponse((response) => (
            response.url().endsWith('/api/agent/tasks') && response.request().method() === 'POST'
        ));
        await dialog.getByLabel('Message').fill(request);
        await dialog.getByRole('button', { name: 'Prepare handoff' }).click();
        const response = await responsePromise;
        expect(response.status()).toBe(201);
        return response.json();
    };

    const sendDelegatedProposal = async (task, operations) => {
        const token = `browser-agent-access-token-${suffix}`;
        const exchangeResponse = await page.request.post('/api/agent/internal/exchange', {
            data: { access_token: token },
            headers: { 'X-Fractal-Agent-Secret': 'browser-test-only-shared-secret' },
        });
        expect(exchangeResponse.status()).toBe(200);
        const exchange = await exchangeResponse.json();
        const proposalResponse = await page.request.post(
            `/api/agent/internal/tasks/${encodeURIComponent(task.id)}/proposals`,
            {
                data: { operations },
                headers: {
                    Authorization: `Bearer ${exchange.access_token}`,
                    'X-Fractal-Agent-Secret': 'browser-test-only-shared-secret',
                },
            },
        );
        expect(proposalResponse.status()).toBe(201);
        return proposalResponse.json();
    };

    const cancellationTask = await createTask('Prepare several planning notes, then let me cancel the queued run.');
    await page.getByRole('link', { name: 'PROGRAMS', exact: true }).click();
    await expect(page).toHaveURL(`/${rootId}/programs`);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Prepare several planning notes, then let me cancel the queued run.', { exact: true }).first()).toBeVisible();
    await page.getByRole('link', { name: 'GOALS', exact: true }).click();
    await expect(page).toHaveURL(`/${rootId}/goals`);
    const cancellationProposal = await sendDelegatedProposal(cancellationTask, Array.from({ length: 10 }, (_, index) => ({
        operation_id: `cancel-note-${index}`,
        type: 'create_note',
        data: {
            content: `Queued note ${index}`,
            context_type: 'root',
            context_id: rootId,
        },
    })));
    expect(cancellationProposal.status).toBe('awaiting_approval');
    await expect(dialog.getByRole('button', { name: 'Approve and run' })).toBeVisible({ timeout: 15_000 });

    // Let the standalone worker complete an empty poll and enter its bounded
    // idle wait so the queued cancellation is deterministic on desktop/mobile.
    await page.waitForTimeout(10_500);
    const approveCancellation = dialog.getByRole('button', { name: 'Approve and run' });
    await approveCancellation.focus();
    await approveCancellation.press('Enter');
    const cancelButton = dialog.getByRole('button', { name: 'Cancel remaining work' });
    await expect(cancelButton).toBeVisible({ timeout: 5_000 });
    await cancelButton.focus();
    await cancelButton.press('Enter');
    await expect(dialog.getByText('cancelled', { exact: true })).toBeVisible({ timeout: 5_000 });

    const executionTask = await createTask('Create one goal and show it on this screen.');
    const executionProposal = await sendDelegatedProposal(executionTask, [{
        operation_id: 'visible-goal',
        type: 'create_goal',
        data: {
            name: `External refresh goal ${suffix}`,
            type: 'LongTermGoal',
            parent_id: rootId,
        },
    }]);
    expect(executionProposal.status).toBe('awaiting_approval');
    await expect(dialog.getByRole('button', { name: 'Approve and run' })).toBeVisible({ timeout: 15_000 });
    const approveExecution = dialog.getByRole('button', { name: 'Approve and run' });
    await approveExecution.focus();
    await approveExecution.press('Enter');
    await dialog.getByRole('button', { name: 'Minimize AI assistant' }).click();
    await expect(dialog).toBeHidden();

    // The authenticated-layout cursor subscription refreshes the visible goal
    // tree while the assistant pop-up is minimized.
    await expect(page.getByText(`External refresh goal ${suffix}`, { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByText(`External refresh goal ${suffix}`, { exact: true })).toBeVisible();

    const reopenedAskAi = page.getByRole('button', { name: 'ASK AI', exact: true });
    await reopenedAskAi.focus();
    await reopenedAskAi.press('Enter');
    const reopenedDialog = page.getByRole('dialog', { name: 'Fractal AI' });
    await expect(reopenedDialog.getByText('succeeded', { exact: true })).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
});
