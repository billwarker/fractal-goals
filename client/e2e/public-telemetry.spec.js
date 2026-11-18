import { expect, test } from '@playwright/test';
import { DEMO_SHOWCASE } from './demoIds';

// Public visitors: no saved session, nothing stored on the device.
test.use({ storageState: { cookies: [], origins: [] } });

/** Every public telemetry batch the page sends; they still reach the real server. */
function recordPublicTelemetry(page) {
    const batches = [];
    page.on('request', (request) => {
        if (request.url().includes('/api/public/telemetry') && request.method() === 'POST') {
            batches.push(request.postDataJSON());
        }
    });
    const events = () => batches.flatMap((batch) => batch.events);
    return { batches, events, names: () => events().map((event) => event.name) };
}

test('a campaign visit is counted, carried into the demo, and attributed on the waitlist', async ({ page }) => {
    const telemetry = recordPublicTelemetry(page);
    let signup = null;
    await page.route('**/api/public/beta-signups', async (route) => {
        signup = route.request().postDataJSON();
        await route.fulfill({ status: 201, json: { created: true } });
    });

    await page.goto('/landing-preview?utm_source=Newsletter&utm_campaign=nov');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(telemetry.names).toContain('landing_view');
    const landingBatch = telemetry.batches.find((batch) => batch.events.some((event) => event.name === 'landing_view'));
    expect(landingBatch.context).toMatchObject({ path: '/landing-preview', utm_source: 'Newsletter', utm_campaign: 'nov' });

    // The demo links hand the campaign on, so a demo signup still knows it.
    const demo = page.getByRole('list', { name: 'Try the live demo' }).getByRole('link').first();
    await expect(demo).toHaveAttribute('href', `/demo/${DEMO_SHOWCASE}/goals?tour=1&utm_source=Newsletter&utm_campaign=nov`);

    await page.getByRole('button', { name: 'or join the waitlist' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email').fill('visitor@example.com');
    await dialog.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(dialog.getByRole('button', { name: 'Keep exploring' })).toBeVisible();

    expect(signup).toMatchObject({ email: 'visitor@example.com', source: 'utm:newsletter' });
    await expect.poll(telemetry.names).toEqual(expect.arrayContaining(['waitlist_opened', 'waitlist_submitted']));
    const submitted = telemetry.events().find((event) => event.name === 'waitlist_submitted');
    expect(submitted.props).toEqual({ source: 'landing', created: true });
    // Nothing for analytics is kept on the device.
    expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});

test('the demo records its start from the tour and where sign-up was opened', async ({ page }) => {
    const telemetry = recordPublicTelemetry(page);

    await page.goto(`/demo/${DEMO_SHOWCASE}/goals?tour=1`);
    const guide = page.getByRole('region', { name: 'Demo guide' });
    await expect(guide).toBeVisible();
    await expect.poll(telemetry.names).toContain('demo_started');
    expect(telemetry.events().find((event) => event.name === 'demo_started').props).toEqual({
        example_position: 0, from_tour: true,
    });

    await guide.getByRole('button', { name: 'Sign up to build your own' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(telemetry.events).toContainEqual({ name: 'waitlist_opened', props: { source: 'demo_guide' } });
});

test('Global Privacy Control stops public telemetry altogether', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }));
    const telemetry = recordPublicTelemetry(page);

    await page.goto('/landing-preview');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'or join the waitlist' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Longer than the client's one-second batching delay.
    await page.waitForTimeout(1500);

    expect(telemetry.batches).toEqual([]);
});
