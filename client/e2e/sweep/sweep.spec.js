import fs from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test as base, expect } from '@playwright/test';
import { RESULTS_DIR, SURFACES } from './manifest.js';

// One test per surface; each sweep project (viewport × theme, see playwright.config.js)
// runs all of them. Findings are written next to the screenshot for sweep-report.mjs.
// With SWEEP_ENFORCE=1 the checks also fail the test (CI, once the baseline is clean).

const test = base.extend({
    sweepTheme: ['dark', { option: true }],
    sweepViewport: ['desktop', { option: true }],
});

const ENFORCE = process.env.SWEEP_ENFORCE === '1';
// WCAG 2.5.8 (AA) minimum; anything under `RECOMMENDED` is reported but never fails.
const MINIMUM_TARGET = 24;
const RECOMMENDED_TARGET = 40;

async function settle(page) {
    // Pages that poll never go fully idle; a bounded wait is enough for a still frame.
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    // Then wait out visible loading states, so a slow phone render isn't captured mid-load.
    await page.waitForFunction(() => {
        if (document.querySelector('[aria-busy="true"]')) return false;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (/^\s*Loading\b/i.test(node.textContent) && node.parentElement?.offsetParent !== null) return false;
        }
        return true;
    }, null, { timeout: 20_000, polling: 250 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(400);
}

// Runs in the page, so it must stay self-contained.
function measureLayout({ touch, minimum, recommended }) {
    const describe = (element) => {
        const label = element.getAttribute('aria-label') || element.textContent?.trim() || element.getAttribute('title') || '';
        const classes = typeof element.className === 'string' ? element.className.split(/\s+/).slice(0, 2).join('.') : '';
        return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''} "${label.slice(0, 40)}"`;
    };
    const overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
    const targets = [];
    // With a modal open, only its controls can be reached; the page behind it is inert.
    const modal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].pop();
    const scope = modal || document;
    if (touch) {
        const selector = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [role=option]';
        for (const element of scope.querySelectorAll(selector)) {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const style = getComputedStyle(element);
            if (style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
            // Links inside running text are exempt from target size (WCAG 2.5.8).
            if (element.tagName === 'A' && style.display === 'inline') continue;
            // Goal-tree nodes sit on a pinch-zoomable canvas: their size follows the zoom.
            if (element.closest('.react-flow__node')) continue;
            // A checkbox or radio inside its <label> is tapped through the whole label.
            const label = ['checkbox', 'radio'].includes(element.type) ? element.closest('label') : null;
            const box = label ? label.getBoundingClientRect() : rect;
            const size = Math.min(box.width, box.height);
            if (size < recommended) {
                targets.push({ element: describe(element), width: Math.round(box.width), height: Math.round(box.height), failing: size < minimum });
            }
        }
    }
    return { overflow, targets };
}

for (const surface of SURFACES) {
    test(surface.id, async ({ page, browser, sweepTheme, sweepViewport }, testInfo) => {
        let target = page;
        let context = null;
        if (surface.auth === false) {
            // Logged-out surfaces get a fresh context. Playwright applies the project's options,
            // saved session included, to new contexts, so the empty state must be explicit.
            context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
            target = await context.newPage();
        }
        // Captures run in parallel under one account, so the theme must stay per device: hide the
        // account's synced appearance and drop writes to it (ThemeContext syncs both ways).
        await target.route('**/api/auth/me', async (route) => {
            const response = await route.fetch();
            const body = await response.json().catch(() => null);
            if (body?.preferences) delete body.preferences.appearance;
            await route.fulfill({ response, json: body ?? undefined });
        });
        await target.route('**/api/auth/preferences', (route) => route.fulfill({ status: 204, body: '' }));
        await target.addInitScript((theme) => {
            localStorage.setItem('theme', theme);
            localStorage.setItem('theme-preference', JSON.stringify({ mode: theme }));
        }, sweepTheme);

        await target.goto(surface.path);
        await settle(target);
        if (surface.open) {
            await surface.open(target);
            await settle(target);
        }
        if (surface.ready) await surface.ready(target);

        const directory = path.join(RESULTS_DIR, surface.id);
        await fs.mkdir(directory, { recursive: true });
        const name = `${sweepViewport}-${sweepTheme}`;
        await target.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true });

        const touch = Boolean(testInfo.project.use.hasTouch);
        const layout = await target.evaluate(measureLayout, {
            touch, minimum: MINIMUM_TARGET, recommended: RECOMMENDED_TARGET,
        });
        let axeBuilder = new AxeBuilder({ page: target })
            .withTags(['wcag2a', 'wcag2aa'])
            .disableRules(['region']);
        // As with targets: with a modal open, check the modal, not the inert page behind it.
        if (await target.locator('[role="dialog"][aria-modal="true"]').count()) {
            axeBuilder = axeBuilder.include('[role="dialog"][aria-modal="true"]');
        }
        const axe = await axeBuilder.analyze();
        const violations = axe.violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            count: violation.nodes.length,
            example: violation.nodes[0]?.target?.join(' '),
        }));

        const result = {
            surface: surface.id,
            path: surface.path,
            viewport: sweepViewport,
            theme: sweepTheme,
            capturedAt: new Date().toISOString(),
            overflow: layout.overflow,
            targets: layout.targets,
            violations,
        };
        await fs.writeFile(path.join(directory, `${name}.json`), JSON.stringify(result, null, 2));
        if (context) await context.close();

        if (ENFORCE) {
            expect.soft(layout.overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(1);
            expect.soft(layout.targets.filter((item) => item.failing), 'touch targets under 24px').toEqual([]);
            expect.soft(violations.filter((item) => ['serious', 'critical'].includes(item.impact)), 'serious axe violations').toEqual([]);
        }
    });
}
