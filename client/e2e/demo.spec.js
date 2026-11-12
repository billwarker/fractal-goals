import { expect, test } from '@playwright/test';
import { DEMO_SHOWCASE, DEMO_SPANISH, demoId } from './demoIds';

// The live demo is for visitors: no saved session, nothing stored.
test.use({ storageState: { cookies: [], origins: [] } });

const TOUR = [
    { title: 'One ambition, broken down', path: new RegExp(`/demo/${DEMO_SHOWCASE}/goals$`) },
    { title: 'Inside a goal', path: /\/goals(\?goal=.+)?$/ },
    { title: 'Every session, logged', path: /\/sessions$/ },
    { title: 'Inside a session', path: /\/session\/[^/]+$/ },
    { title: 'Activities and metrics', path: /\/manage-activities$/ },
    { title: 'Programs on a calendar', path: /\/programs(\/[^/]+)?$/ },
    { title: 'See whether it’s working', path: /\/analytics$/ },
    { title: 'Notes in context', path: /\/notes$/ },
    { title: 'Make it yours', path: /\/notes$/ },
];

test('a visitor tours the real app read-only, switches examples, and signs up', async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    const errors = [];
    const writes = [];
    const refused = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
        if (request.url().includes('/api/') && !request.url().includes('/api/public/') && request.method() !== 'GET') {
            writes.push(`${request.method()} ${request.url()}`);
        }
    });
    page.on('response', (response) => {
        if (response.url().includes('/api/') && [401, 403].includes(response.status())) refused.push(response.url());
    });
    await page.route('**/api/public/beta-signups', (route) => route.fulfill({ status: 201, json: { created: true } }));

    // From the landing, straight into the real Goals page with the guide open.
    await page.goto('/landing-preview');
    await page.getByRole('link', { name: /^Jazz guitar:/ }).click();
    const guide = page.getByRole('region', { name: 'Demo guide' });
    await expect(guide).toBeVisible();
    await expect(page.locator('.react-flow__node').first()).toBeVisible();

    // Every step opens a real page and points at it.
    for (const [index, step] of TOUR.entries()) {
        await expect(guide.getByRole('heading', { name: step.title })).toBeVisible();
        await expect(guide.getByText(`Step ${index + 1} of ${TOUR.length}`)).toBeVisible();
        await expect(page).toHaveURL(step.path);
        if (index < TOUR.length - 1) {
            if (index > 0) await expect(page.getByTestId('demo-spotlight')).toBeVisible();
            await guide.getByRole('button', { name: 'Next', exact: true }).click();
        }
    }

    // Switch examples from the guide: same place, other fractal.
    await guide.getByRole('button', { name: 'Back', exact: true }).click();
    await guide.getByRole('button', { name: 'Hold a conversation in Spanish' }).click();
    await expect(page).toHaveURL(new RegExp(`/demo/${DEMO_SPANISH}/notes$`));
    await expect(guide.getByText('Step 8 of 9')).toBeVisible();

    // Saving is refused before the network, with a prompt instead of an error.
    await guide.getByRole('button', { name: 'Minimise the demo guide' }).click();
    await page.goto(`/demo/${DEMO_SHOWCASE}/goals?goal=${demoId('sweep-showcase-root', 'sweep-goal-ii-v-i')}`);
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await page.getByRole('button', { name: /^save/i }).first().click();
    const prompt = page.getByRole('dialog', { name: 'This is a live demo' });
    await expect(prompt).toBeVisible();
    await expect(page.locator('[role="status"]', { hasText: /failed/i })).toHaveCount(0);
    await prompt.getByRole('button', { name: 'Sign up' }).click();

    // Sign up: the waitlist, or an invite key that hands off to the app's prefilled sign-up.
    const signup = page.getByRole('dialog', { name: 'Build your own tree' });
    await signup.getByLabel('Email').fill(`demo-${project}@example.com`);
    await signup.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(signup.getByRole('status')).toContainText('a link that sets up your account');
    await signup.getByRole('button', { name: 'Keep exploring' }).click();

    // Minimised, the guide keeps sign-up one tap away.
    await page.getByRole('button', { name: 'Sign up', exact: true }).click();
    await signup.getByRole('button', { name: 'Have an invite key?' }).click();
    await signup.getByLabel('Invite key').fill('browser-invite-demo');
    await signup.getByRole('button', { name: 'Create my account' }).click();
    await expect(page).toHaveURL(/\/\?invite_key=browser-invite-demo/);

    expect(writes).toEqual([]);
    expect(refused).toEqual([]);
    expect(errors).toEqual([]);
});

test('the demo keeps nothing on the device and leaves cleanly', async ({ page }) => {
    // A visitor who prefers dark: the theme is theirs, not an account write to refuse.
    await page.addInitScript(() => localStorage.setItem('theme-preference', JSON.stringify({ mode: 'dark', darkFrom: '20:00', lightFrom: '07:00' })));
    await page.goto(`/demo/${DEMO_SHOWCASE}/sessions`);
    const guide = page.getByRole('region', { name: 'Demo guide' });
    await expect(guide).toBeVisible();
    await guide.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.waitForTimeout(500);
    await expect(page.getByRole('dialog', { name: 'This is a live demo' })).toHaveCount(0);
    // The account-only parts of the app aren't offered.
    await expect(page.getByRole('button', { name: /settings/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /ask ai/i })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

    await page.getByRole('region', { name: 'Demo guide' }).getByRole('button', { name: 'Exit demo' }).click();
    await expect(page).toHaveURL(/\/landing-preview$/);
});
