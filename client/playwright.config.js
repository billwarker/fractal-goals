import { defineConfig, devices } from '@playwright/test';
import { AUTH_STATE, THEMES, VIEWPORTS } from './e2e/sweep/manifest.js';
import { BROWSER_USER_STATE } from './e2e/support/session.js';

// `npm run sweep` (SWEEP=1) runs only the visual sweep: every surface in
// e2e/sweep/manifest.js at each viewport × theme. Workflow specs never run it.
const sweepProjects = [
    { name: 'sweep-setup', testMatch: /sweep\/auth\.setup\.js/, use: { ...devices['Desktop Chrome'] } },
    ...Object.entries(VIEWPORTS).flatMap(([viewportName, viewport]) => THEMES.map((theme) => ({
        name: `sweep-${viewportName}-${theme}`,
        testMatch: /sweep\/sweep\.spec\.js/,
        dependencies: ['sweep-setup'],
        use: {
            ...devices['Desktop Chrome'],
            ...viewport,
            storageState: AUTH_STATE,
            sweepTheme: theme,
            sweepViewport: viewportName,
        },
    }))),
];

// Every workflow project starts signed in (e2e/auth.setup.js signs in once per run).
const signedIn = { dependencies: ['setup'], testIgnore: [/sweep\//, /auth\.setup\.js/] };
const workflowProjects = [
    { name: 'setup', testMatch: /e2e\/auth\.setup\.js/, use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop', ...signedIn, use: { ...devices['Desktop Chrome'], storageState: BROWSER_USER_STATE } },
    {
        name: 'mobile',
        ...signedIn,
        use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', storageState: BROWSER_USER_STATE },
    },
    // Program calendars at 22:00 New York time, when the local day is behind UTC.
    {
        name: 'desktop-late',
        ...signedIn,
        testMatch: /program-.*\.spec\.js/,
        use: {
            ...devices['Desktop Chrome'],
            storageState: BROWSER_USER_STATE,
            timezoneId: 'America/New_York',
            lateEveningClock: true,
        },
    },
];

const sweeping = process.env.SWEEP === '1';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    // A sweep capture is retried once: a real finding fails both attempts, a stalled page load
    // on a busy runner doesn't fail the run. Workflow specs never retry.
    retries: sweeping ? 1 : 0,
    workers: sweeping ? 4 : 2,
    // Hosted runners take 2-4x as long as a laptop, so a long workflow that fits 30 s here runs
    // out on CI. They get 60 s there; tests that need more still set their own.
    timeout: sweeping || process.env.CI ? 60_000 : 30_000,
    // Assertions wait up to 10 s: first loads after a fresh server and parallel browsers can
    // run past the 5 s default on a busy machine without anything being wrong.
    expect: { timeout: 10_000 },
    reporter: [['list'], ['html', { open: 'never' }]],
    use: { baseURL: 'http://127.0.0.1:8012', trace: 'retain-on-failure' },
    projects: sweeping ? sweepProjects : workflowProjects,
    webServer: {
        command: `${process.env.PYTHON || '../fractal-goals-venv/bin/python'} ../scripts/browser_test_server.py`,
        url: 'http://127.0.0.1:8012/api/readyz',
        timeout: 60_000,
        reuseExistingServer: false,
        gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
});
