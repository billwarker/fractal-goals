import { defineConfig, devices } from '@playwright/test';
import { AUTH_STATE, THEMES, VIEWPORTS } from './e2e/sweep/manifest.js';

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

const workflowProjects = [
    { name: 'desktop', testIgnore: /sweep\//, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testIgnore: /sweep\//, use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    // Program calendars at 22:00 New York time, when the local day is behind UTC.
    {
        name: 'desktop-late',
        testMatch: /program-.*\.spec\.js/,
        use: { ...devices['Desktop Chrome'], timezoneId: 'America/New_York', lateEveningClock: true },
    },
];

const sweeping = process.env.SWEEP === '1';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    workers: sweeping ? 4 : 2,
    timeout: sweeping ? 60_000 : 30_000,
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
