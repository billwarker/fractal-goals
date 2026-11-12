import { expect, test } from '@playwright/test';

import { apiToken, openOrigin } from './support/session.js';
import { openGoalFromTree } from './support/goals.js';

// Tests start signed in (e2e/auth.setup.js); this puts the page on the app's origin and returns
// the API token for seeding.
async function openSignedIn(page) {
    await openOrigin(page);
    return apiToken();
}

// The "Browser Planning" root sits on the Ultimate level, which uses a success vision and is reviewed yearly.
test('a due review shows a Review banner and can be written from goal details', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name;
    const root = `browser-plan-root-${suffix}`;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('fractal_timezone_preference', 'UTC'));
    const headers = { Authorization: `Bearer ${await openSignedIn(page)}` };
    // Started over a year ago, so its first yearly review is due.
    const started = await page.request.put(`/api/${root}/goals/${root}`, {
        headers, data: { started_at: '2025-01-01', description: 'Plan sessions that build toward a recital.' },
    });
    expect(started.ok(), await started.text()).toBeTruthy();

    await page.goto(`/${root}/goals`);
    if (suffix === 'mobile') await page.getByRole('button', { name: 'Tree', exact: true }).click();
    const details = suffix === 'mobile' ? page.getByRole('dialog', { name: `Browser Planning ${suffix}` }) : page;
    await openGoalFromTree(page, `Browser Planning ${suffix}`, details.getByRole('region', { name: 'Review due' }));
    // The banner alone says a review is due; the details carry no schedule line.
    await expect(details.getByText(/Review every year/)).toHaveCount(0);
    // SMART's R is Reviewed: the due review takes it away until one is written.
    const smart = async () => (await (await page.request.get(`/api/${root}/goals/${root}`, { headers })).json()).smart_status.reviewed;
    expect(await smart()).toBe(false);

    // The banner offers only Review.
    const banner = details.getByRole('region', { name: 'Review due' });
    await expect(banner.getByRole('button')).toHaveText(['Review']);
    if (suffix === 'mobile') {
        expect(errors).toEqual([]);
        return;
    }

    // The guided form: what changed since the last review above a few questions; Save sits in the footer.
    await details.getByRole('button', { name: 'Review', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Review context' })).toContainText('Plan sessions that build toward a recital.');
    const save = page.getByRole('button', { name: 'Save review' });
    await expect(save).toBeDisabled();
    await page.getByRole('button', { name: 'On track' }).click();
    await page.getByLabel('What went well?').fill('Played through the set');
    const saved = page.waitForResponse((response) => response.url().endsWith(`/api/${root}/notes`) && response.request().method() === 'POST');
    await save.click();
    expect((await saved).ok()).toBeTruthy();

    await expect(page.getByRole('region', { name: 'Review due' })).toHaveCount(0);
    const goal = await (await page.request.get(`/api/${root}/goals/${root}`, { headers })).json();
    expect(goal.review.status).toBe('upcoming');
    expect(await smart()).toBe(true);
    const notes = await (await page.request.get(`/api/${root}/goals/${root}/notes`, { headers })).json();
    const review = notes.find((note) => note.note_type === 'goal_review_note');
    expect(review.review_data).toMatchObject({ status: 'on_track', went_well: 'Played through the set' });

    // Editing it later from the Notes page brings back the form, filled in; the review keeps its date.
    await page.goto(`/${root}/notes`);
    const card = page.getByText('Played through the set').locator('xpath=ancestor::*[.//button[@aria-label="Note options"]][1]');
    await card.getByRole('button', { name: 'Note options' }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(page.getByLabel('What went well?')).toHaveValue('Played through the set');
    await expect(page.getByRole('button', { name: 'On track' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('What would you change?').fill('Rehearse the ending');
    const updated = page.waitForResponse((response) => response.url().endsWith(`/api/${root}/notes/${review.id}`) && response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save changes' }).click();
    expect((await updated).ok()).toBeTruthy();
    await expect(page.getByText('Rehearse the ending')).toBeVisible();
    const edited = (await (await page.request.get(`/api/${root}/goals/${root}/notes`, { headers })).json())
        .find((note) => note.id === review.id);
    expect(edited.review_data.change).toBe('Rehearse the ending');
    expect(edited.created_at).toBe(review.created_at);
    expect(errors).toEqual([]);
});
