#!/usr/bin/env node
// Prove the production nginx image's CSP in a real browser: the delivered shell
// boots without violations, injected inline and foreign-origin script are blocked,
// and the monitoring path (same-origin replay worker, Sentry ingest) stays allowed. (Playwright's evaluate runs through DevTools, which CSP exempts from
// eval checks, so the absence of 'unsafe-eval' is asserted by
// scripts/check_frontend_headers.py instead.)
// Usage: node scripts/check-csp-enforcement.mjs [image]
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const image = process.argv[2] || 'fractal-client:headers';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();

const container = docker(
    'run', '--rm', '-d', '-p', '127.0.0.1::8080',
    '-e', 'BACKEND_URL=http://127.0.0.1:9', '-e', 'TRUSTED_PROXY_SECRET=csp-test-only-secret', image,
);

async function waitForServer(origin) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            const response = await fetch(origin);
            if (response.ok) return;
        } catch {
            // Container still starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('nginx container did not start');
}

let browser;
try {
    const origin = `http://${docker('port', container, '8080')}`;
    await waitForServer(origin);
    browser = await chromium.launch();
    const page = await browser.newPage();
    const violations = [];
    await page.exposeFunction('__recordCspViolation', (violation) => violations.push(violation));
    await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
            window.__recordCspViolation({ directive: event.effectiveDirective, blocked: event.blockedURI });
        });
    });

    // The backend is unreachable, so the app shows its offline/error state; the
    // shell, boot script, and bundle must still load under the policy.
    await page.goto(`${origin}/a/deep/spa/link`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const firstPartyScriptViolations = violations.filter((violation) => violation.directive.startsWith('script-src'));
    if (firstPartyScriptViolations.length) {
        throw new Error(`Delivered shell violated its own CSP: ${JSON.stringify(firstPartyScriptViolations)}`);
    }
    const themed = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (!themed) throw new Error('/boot/shell.js did not run under the CSP');

    violations.length = 0;
    const outcome = await page.evaluate(async () => {
        const inline = document.createElement('script');
        inline.textContent = 'window.__cspInlineRan = true;';
        document.head.appendChild(inline);

        await new Promise((resolve) => {
            const foreign = document.createElement('script');
            foreign.src = 'https://untrusted.example/payload.js';
            foreign.onerror = resolve;
            foreign.onload = resolve;
            document.head.appendChild(foreign);
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { inlineRan: Boolean(window.__cspInlineRan) };
    });

    if (outcome.inlineRan) {
        throw new Error(`CSP failed to block injected script: ${JSON.stringify(outcome)}`);
    }
    const blockedForeign = violations.some((violation) => violation.blocked.startsWith('https://untrusted.example'));
    const blockedInline = violations.some((violation) => violation.blocked === 'inline');
    if (!blockedForeign || !blockedInline) {
        throw new Error(`Expected inline and foreign script violations, saw ${JSON.stringify(violations)}`);
    }

    // Monitoring path: the replay compression worker must run from our origin, a Blob
    // worker must stay blocked, and Sentry ingest must be an allowed connection.
    // Network is intercepted, so no Sentry account or telemetry is involved.
    const workerAsset = docker('exec', container, 'sh', '-c', 'ls /usr/share/nginx/html/assets | grep "^worker-bundler-"');
    if (!workerAsset) throw new Error('Replay worker asset missing from the image');
    await page.route('https://*.ingest.sentry.io/**', (route) => route.fulfill({ status: 200, body: '{}' }));
    violations.length = 0;
    const monitoring = await page.evaluate(async (workerPath) => {
        const settle = (worker) => new Promise((resolve) => {
            const timer = setTimeout(() => resolve('timeout'), 3000);
            worker.onmessage = (event) => { clearTimeout(timer); resolve(event.data?.method || 'message'); };
            worker.onerror = () => { clearTimeout(timer); resolve('error'); };
        });
        const sameOrigin = await settle(new Worker(workerPath));
        let blob;
        try {
            const url = URL.createObjectURL(new Blob(['postMessage({ method: "init" })'], { type: 'text/javascript' }));
            blob = await settle(new Worker(url));
        } catch {
            blob = 'blocked';
        }
        const ingest = await fetch('https://o0.ingest.sentry.io/api/0/envelope/', { method: 'POST', body: '{}' })
            .then((response) => response.status).catch(() => 'blocked');
        return { sameOrigin, blob, ingest };
    }, `/assets/${workerAsset}`);
    if (monitoring.sameOrigin !== 'init') {
        throw new Error(`Replay worker did not run under the CSP: ${JSON.stringify(monitoring)}`);
    }
    if (monitoring.blob === 'init') throw new Error('Blob worker ran; worker-src must stay strict');
    if (monitoring.ingest !== 200) throw new Error(`Sentry ingest was blocked: ${JSON.stringify(monitoring)}`);
    const monitoringViolations = violations.filter((violation) => !violation.blocked.startsWith('blob'));
    if (monitoringViolations.length) {
        throw new Error(`Monitoring path violated the CSP: ${JSON.stringify(monitoringViolations)}`);
    }

    console.log('CSP enforcement passed: shell boots cleanly; inline and foreign script are blocked; '
        + 'the same-origin replay worker runs, Blob workers stay blocked, and Sentry ingest is allowed');
} finally {
    await browser?.close();
    execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
}
