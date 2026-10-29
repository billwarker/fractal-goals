import { expect, test } from '@playwright/test';

async function openGoalNotes(page, suffix, { beforeOpen } = {}) {
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    const login = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    const { token } = await (await login).json();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    await beforeOpen?.(token);
    await page.goto(`/browser-root-${suffix}/goals`);
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Tree', exact: true }).click();
    await expect(async () => {
        await page.locator('.react-flow__node').filter({ hasText: `Browser Practice ${suffix}` })
            .getByText(`Browser Practice ${suffix}`, { exact: true }).click();
        await page.getByRole('tab', { name: 'Notes', exact: true }).click({ timeout: 2000 });
        await expect(page.getByPlaceholder('Add a goal note...')).toBeVisible({ timeout: 2000 });
    }).toPass();
}

async function mockConnectedStorage(page, uploads) {
    await page.route('**/api/storage/connections', (route) => route.fulfill({ json: {
        providers: [
            { provider: 'google_drive', configured: true, status: 'active', connected: true, account_label: 'me@example.test', attachment_count: 0 },
            { provider: 'dropbox', configured: true, status: 'active', connected: true, account_label: 'me@dropbox.test', attachment_count: 0 },
        ],
        upload_destination: 'dropbox',
        limits: { max_file_bytes: 104857600, max_attachments: 8 },
    } }));
    await page.route('**/media/uploads', (route) => {
        const body = route.request().postDataJSON();
        uploads.push(body);
        return route.fulfill({ status: 201, json: { id: `upload-${uploads.length}`, offset: 0, size_bytes: body.size_bytes, chunk_bytes: 1048576, asset: null } });
    });
    await page.route('**/media/uploads/*', (route) => {
        const id = route.request().url().split('/').pop();
        return route.fulfill({ json: { id, offset: 1, size_bytes: 1, chunk_bytes: 1048576, asset: { id: `asset-${id}`, name: `${id}.png`, mime_type: 'image/png' } } });
    });
}

function pasteImage(locator) {
    return locator.evaluate((element) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' }));
        element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    });
}

test('notes explain unavailable cloud storage and preserve the draft', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    await page.goto(`/browser-root-${testInfo.project.name}/notes`);
    await page.getByRole('button', { name: /Write Note/ }).click();
    const textarea = page.getByPlaceholder('Write a note…', { exact: false });
    await textarea.fill('Keep this draft while choosing evidence.');
    await page.getByRole('button', { name: 'Choose from cloud storage', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Choose from cloud storage' });
    await expect(dialog.getByText(/Cloud storage isn't available yet/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Connect / })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(textarea).toHaveValue('Keep this draft while choosing evidence.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test('the goal quick note bar attaches media from beside the add-note button', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    await openGoalNotes(page, suffix);
    const attach = page.getByRole('button', { name: 'Attach pictures or video', exact: true });
    const add = page.getByRole('button', { name: 'Add note', exact: true });
    const [attachBox, addBox] = [await attach.boundingBox(), await add.boundingBox()];
    // The add-note button comes first, then the paperclip (00e40d76).
    expect(addBox.x + addBox.width).toBeLessThanOrEqual(attachBox.x);
    expect(Math.abs(attachBox.y - addBox.y)).toBeLessThan(2);
    await attach.click();
    const menu = page.getByRole('menu', { name: 'Attach from' });
    await expect(menu.getByRole('menuitem')).toHaveText(['From this device', 'From cloud storage']);
    const menuBox = await menu.boundingBox();
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(attachBox.y);  // Opens upward from the bottom bar.
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('attach-menu.png') });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // Without connected storage a pasted picture explains itself and keeps the typed text.
    const textbox = page.getByPlaceholder('Add a goal note...');
    await textbox.fill('Keep this text');
    await pasteImage(textbox);
    await expect(page.getByRole('alert')).toContainText('Cloud storage isn’t available yet');
    await expect(textbox).toHaveValue('Keep this text');
    await attach.click();
    await page.getByRole('menuitem', { name: 'From cloud storage' }).click();
    await expect(page.getByRole('dialog', { name: 'Choose from cloud storage' }).getByText(/Cloud storage isn't available yet/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test('pasted and dropped pictures upload into connected storage before the note is saved', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const uploads = [];
    await mockConnectedStorage(page, uploads);
    await openGoalNotes(page, suffix);
    const textbox = page.getByPlaceholder('Add a goal note...');
    await pasteImage(textbox);
    await textbox.dispatchEvent('drop', { dataTransfer: await page.evaluateHandle(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'dropped.png', { type: 'image/png' }));
        return transfer;
    }) });
    const pending = page.getByRole('list', { name: 'Attachments for this note' });
    await expect(pending.getByRole('listitem')).toHaveCount(2);
    expect(uploads.map((upload) => upload.provider)).toEqual(['dropbox', 'dropbox']);  // The destination chosen in Settings.
    expect(uploads[0].name).toMatch(/^Pasted image .+\.png$/);
    expect(uploads[1].name).toBe('dropped.png');
    await textbox.fill('Two screenshots');
    await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('quick-note-uploads.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test('activity and session notes attach pictures from the same paperclip menu', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const uploads = [];
    await mockConnectedStorage(page, uploads);
    await page.goto('/');
    await page.getByText('LOG IN', { exact: true }).click();
    await page.getByLabel('Username or Email').fill('browser_user');
    await page.getByLabel('Password', { exact: true }).fill('BrowserTest123!');
    await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
    await expect(page.getByText('Browser Practice desktop').first()).toBeVisible();
    await page.goto(`/browser-root-${suffix}/session/browser-session-${suffix}`);
    await expect(page.getByText('Focused Practice').first()).toBeVisible();

    const textbox = page.getByPlaceholder('Add a note about this activity...');
    await expect(textbox).toBeVisible();
    const bar = page.locator('form').filter({ has: textbox });
    await bar.getByRole('button', { name: 'Attach pictures or video', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /From this device/ })).toContainText('Saved to Dropbox');
    await page.keyboard.press('Escape');
    await pasteImage(textbox);
    await expect(bar.getByRole('list', { name: 'Attachments for this note' }).getByRole('listitem')).toHaveCount(1);
    expect(uploads[0].provider).toBe('dropbox');
    await textbox.fill('Form check');
    await expect(bar.getByRole('button', { name: 'Add note', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('activity-quick-note.png') });

    if (suffix === 'mobile') await page.getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByRole('button', { name: 'Session Notes', exact: true }).click();
    const sessionBar = page.locator('form').filter({ has: page.getByPlaceholder('Add a session note...') });
    await expect(sessionBar.getByRole('button', { name: 'Attach pictures or video', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test('a note’s options menu closes on an outside click without crashing the page', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const root = `browser-root-${suffix}`;
    await openGoalNotes(page, suffix, { beforeOpen: async (token) => {
        const created = await page.request.post(`/api/${root}/notes`, { headers: { Authorization: `Bearer ${token}` },
            data: { content: `menu regression ${suffix}`, context_type: 'goal', context_id: root, goal_id: root } });
        expect(created.ok()).toBeTruthy();
    } });
    const text = page.getByText(`menu regression ${suffix}`).first();
    await expect(text).toBeVisible();
    const card = page.locator('[class*="noteCard_"]').filter({ has: text });
    await card.getByRole('button', { name: 'Note options' }).click();
    await expect(page.getByRole('menu', { name: 'Note options' }).getByRole('menuitem'))
        .toContainText(['Edit', 'Attach pictures or video', 'Pin note', 'Delete']);
    // A real press on the note text used to crash Chrome's renderer while the menu was open.
    // Press its left edge: on narrow screens the right-aligned menu covers the middle.
    await text.click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole('menu', { name: 'Note options' })).toHaveCount(0);
    await card.getByRole('button', { name: 'Note options' }).click();
    await page.getByRole('menuitem', { name: 'Attach pictures or video' }).click();
    await expect(page.getByRole('region', { name: 'Manage attachments' })).toBeVisible();
    expect(errors).toEqual([]);
});

test('goal descriptions and completion notes take pasted pictures into cloud storage', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    test.skip(suffix !== 'desktop', 'The goal details flow is the same on mobile; one viewport covers the wiring.');
    const uploads = [];
    await mockConnectedStorage(page, uploads);
    const sent = { goal: null, note: null };
    await page.route('**/api/*/goals/*/attachments', (route) => route.fulfill({ json: [] }));
    await page.route(new RegExp(`/api/browser-root-${suffix}/goals/browser-root-${suffix}$`), async (route) => {
        if (route.request().method() !== 'PUT') return route.fallback();
        const body = route.request().postDataJSON();
        sent.goal = body;
        const { attachments: _attachments, ...rest } = body;  // The fake asset id isn't in the test database.
        return route.fallback({ postData: JSON.stringify(rest) });
    });
    await page.route(`**/api/browser-root-${suffix}/notes`, async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const body = route.request().postDataJSON();
        sent.note = body;
        const { attachments: _attachments, ...rest } = body;
        return route.fallback({ postData: JSON.stringify(rest) });
    });
    await openGoalNotes(page, suffix);
    await page.getByRole('tab', { name: 'Details', exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const description = page.getByLabel('Description', { exact: true });
    await expect(description).toBeVisible();
    const field = page.locator('[class*="attachableField"]').filter({ has: description });
    await expect(field.getByRole('button', { name: 'Attach pictures or video' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload from device' })).toHaveCount(0);
    await pasteImage(description);
    await expect(page.getByRole('list', { name: 'Attachments for this description' }).getByRole('listitem')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('goal-description.png') });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => sent.goal?.attachments?.length).toBe(1);

    await page.getByRole('button', { name: 'Mark Complete' }).click();
    const note = page.getByLabel('Goal Completion Note (optional):');
    await expect(note).toBeVisible();
    await note.fill('Finally clean');
    await pasteImage(note);
    await expect(page.getByRole('list', { name: 'Attachments for this completion note' }).getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Complete Goal' })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('goal-completion.png') });
    await page.getByRole('button', { name: 'Complete Goal' }).click();
    await expect.poll(() => sent.note?.attachments?.length).toBe(1);
    expect(sent.note).toMatchObject({ content: 'Finally clean', note_kind: 'goal_completion' });
});

test('goal details view mode shows the pictures attached to the description', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await page.route(`**/api/browser-root-${suffix}/goals/browser-root-${suffix}/attachments`, (route) => route.fulfill({ json: [
        { id: 'asset-1', name: 'Form Reference.png', mime_type: 'image/png', provider: 'google_drive', available: true, alt_text: '' },
    ] }));
    await page.route('**/media/asset-1/content', (route) => route.fulfill({ body: png, contentType: 'image/png' }));
    await openGoalNotes(page, suffix);
    await page.getByRole('tab', { name: 'Details', exact: true }).click();
    const image = page.getByRole('img', { name: 'Form Reference.png' });
    await expect(image).toBeVisible();
    await expect(page.getByRole('link', { name: /Form Reference\.png · Google Drive/ })).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);  // View mode, not the editor.
});
