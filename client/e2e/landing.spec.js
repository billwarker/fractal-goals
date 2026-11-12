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
    if (testInfo.project.name === 'desktop') {
        await demos.first().hover();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Play jazz guitar at a jam session');
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
