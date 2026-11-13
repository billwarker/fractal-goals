import { expect, test } from '@playwright/test';
import { DEMO_SHOWCASE } from './demoIds';

// Public visitors and invitees: no saved session.
test.use({ storageState: { cookies: [], origins: [] } });

const noHorizontalOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('the landing is one hero that leads into the live demo or the waitlist', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let signup = null;
    await page.route('**/api/public/beta-signups', async (route) => {
        signup = route.request().postDataJSON();
        await route.fulfill({ status: 201, json: { created: true } });
    });

    await page.goto('/landing-preview');
    // The static first-paint copy hands off quickly once the landing's own CSS has loaded.
    await expect(page.locator('#landing-boot-shell')).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Achieve Your Most Ambitious Goals');

    // Each published example is a door into the demo; hovering previews it in the headline.
    const demos = page.getByRole('list', { name: 'Try the live demo' }).getByRole('link');
    await expect(demos).toHaveCount(2);
    await expect(demos.first()).toHaveAttribute('href', `/demo/${DEMO_SHOWCASE}/goals?tour=1`);
    const preview = page.getByRole('region', { name: /goal tree$/ });
    if (testInfo.project.name === 'desktop') {
        await demos.first().hover();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Play jazz guitar at a jam session');

        // Beside the copy, the example's goal tree: the app's own flow tree.
        const nodes = preview.locator('.react-flow__node');
        await expect(nodes.first()).toBeVisible();
        expect(await nodes.count()).toBeGreaterThan(5);
        const copyBox = await page.getByRole('heading', { level: 1 }).boundingBox();
        const previewBox = await preview.boundingBox();
        expect(previewBox.x).toBeGreaterThanOrEqual(copyBox.x + copyBox.width);
        // It fills the right of the screen out to the window's edge, straight on the page.
        const windowWidth = page.viewportSize().width;
        expect(previewBox.x + previewBox.width).toBeGreaterThanOrEqual(windowWidth - 1);
        expect(previewBox.width).toBeGreaterThan(windowWidth * 0.45);
        expect(await preview.evaluate((region) => getComputedStyle(region).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
        // The whole landing is one screen.
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
        // The tree fades in once it has fitted itself to the panel.
        const viewport = preview.locator('.react-flow__viewport');
        let fitted;
        await expect.poll(async () => {
            const [style, opacity] = await Promise.all([
                viewport.getAttribute('style'),
                preview.locator('.react-flow').evaluate((flow) => getComputedStyle(flow.parentElement).opacity),
            ]);
            const settled = opacity === '1' && style === fitted;
            fitted = style;
            return settled;
        }, { intervals: [250] }).toBe(true);
        // Using the tree shows a faint outline whose edges sit on the background's 20px grid lines.
        const frame = preview.locator('[class*="frame"]');
        await expect(frame).toHaveCSS('opacity', '0');
        await page.mouse.move(previewBox.x + 60, previewBox.y + 60);
        await expect(frame).toHaveCSS('opacity', '1');
        const pageBox = await page.locator('main').boundingBox();
        const frameBox = await frame.boundingBox();
        for (const edge of [frameBox.x - pageBox.x, frameBox.y - pageBox.y, frameBox.x + frameBox.width - 1 - pageBox.x, frameBox.y + frameBox.height - 1 - pageBox.y]) {
            expect(Math.round(edge) % 20).toBe(0);
        }
        expect(windowWidth - (frameBox.x + frameBox.width)).toBeGreaterThanOrEqual(40);
        if (process.env.LANDING_SCREENSHOT) await page.screenshot({ path: process.env.LANDING_SCREENSHOT });

        // Goals take their level's colour and icon from the published levels, not the fallbacks.
        const { examples } = await (await page.request.get('/api/public/landing-examples')).json();
        const published = examples.find((example) => example.root_id === DEMO_SHOWCASE);
        const rootLevel = published.preview.levels.find((level) => level.name === published.preview.tree.level_name);
        expect(published.icon).toMatchObject({ shape: rootLevel.icon, color: rootLevel.color });

        // Visitors can look around: a drag on empty canvas pans and the wheel zooms, without leaving.
        const scale = (style) => Number(/scale\(([\d.]+)\)/.exec(style)[1]);
        const corner = { x: previewBox.x + 24, y: previewBox.y + 48 };
        await page.mouse.move(corner.x, corner.y);
        await page.mouse.down();
        await page.mouse.move(corner.x + 120, corner.y + 80, { steps: 4 });
        await page.mouse.up();
        await expect(viewport).not.toHaveAttribute('style', fitted);
        const panned = await viewport.getAttribute('style');
        await page.mouse.wheel(0, -400);
        await expect.poll(async () => scale(await viewport.getAttribute('style'))).toBeGreaterThan(scale(panned));
        await expect(page).toHaveURL(/\/landing-preview$/);
    } else {
        await expect(preview).toHaveCount(0);
    }

    // The waitlist, from the hero.
    await page.getByRole('button', { name: 'or join the waitlist' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email').fill(`visitor-${testInfo.project.name}@example.com`);
    await dialog.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(dialog.getByRole('status')).toContainText('a link that sets up your account');
    expect(signup).toEqual({ email: `visitor-${testInfo.project.name}@example.com` });
    await dialog.getByRole('button', { name: 'Keep exploring' }).click();

    // The theme toggle flips the whole page.
    const html = page.locator('html');
    const after = (await html.getAttribute('data-theme')) === 'dark' ? 'light' : 'dark';
    await page.getByRole('button', { name: `Switch to ${after} theme` }).click();
    await expect(html).toHaveAttribute('data-theme', after);

    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
});

test('a goal clicked in the tree opens the demo on that goal', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Only desktop shows the tree.');
    await page.goto('/landing-preview');
    const preview = page.getByRole('region', { name: /goal tree$/ });
    const goal = preview.locator('.react-flow__node').filter({ hasText: 'Build a standards repertoire' }).getByText('Build a standards repertoire', { exact: true });
    await expect(goal).toBeVisible();
    await expect(preview.locator('.react-flow').locator('..')).toHaveCSS('opacity', '1');
    await goal.click();
    await expect(page).toHaveURL(new RegExp(`/demo/${DEMO_SHOWCASE}/goals`));
    // The demo opens with that goal's details showing.
    await expect(page.getByRole('tablist', { name: 'Goal detail views' })).toBeVisible();
    await expect(page.getByText('Ten tunes I can call at any jam.')).toBeVisible();
});

test('an emailed invite opens a prefilled sign-up that lands in the welcome flow', async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    const email = `invitee-${project}@example.invalid`;

    // The link services/_admin_beta_signups.py puts in the invite email.
    await page.goto(`/?invite_key=browser-invite-${project}&email=${encodeURIComponent(email)}`);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Email')).toHaveValue(email);
    await expect(dialog.getByLabel('Invite Key')).toHaveValue(`browser-invite-${project}`);

    await dialog.getByLabel('Username').fill(`invitee_${project}`);
    await dialog.getByLabel('Password', { exact: true }).fill('InviteeTest123!');
    await dialog.getByText(/I am 16 or older/).click();
    await expect(dialog.getByRole('checkbox')).toBeChecked();
    await dialog.getByRole('button', { name: 'CREATE' }).click();

    // A brand-new account goes straight into the welcome flow, with the invite gone from the URL.
    await expect(page.getByRole('heading', { name: 'Turn a big goal into a tree you can work on' })).toBeVisible();
    await expect(page).not.toHaveURL(/invite_key/);
});
