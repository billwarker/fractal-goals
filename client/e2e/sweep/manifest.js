// Every surface the visual sweep captures. A surface is a route, optionally followed by an
// `open` step that brings up a modal or sheet. Data comes from the read-only showcase seed
// (scripts/browser_showcase_seed.py), so screenshots stay comparable between runs.
//
// Add a surface whenever a page, modal or sheet is added. `npm run sweep -- --grep <id>`
// re-captures one surface.

export const ROOT = 'sweep-showcase-root';
const r = (path) => `/${ROOT}${path}`;

const clickText = (text) => async (page) => {
    await page.getByText(text, { exact: true }).first().click();
};

export const SURFACES = [
    // Logged out
    { id: 'landing', path: '/landing-preview', auth: false },
    { id: 'landing-waitlist', path: '/landing-preview', auth: false, open: clickText('or join the waitlist') },
    // The live demo: the real app, read-only, with the guide (src/demo/).
    { id: 'demo-goals', path: `/demo${r('/goals')}?tour=1`, auth: false },
    { id: 'demo-session', path: `/demo${r('/session/sweep-session-0')}`, auth: false },
    { id: 'demo-signup', path: `/demo${r('/goals')}`, auth: false, open: clickText('Sign up to build your own') },
    { id: 'auth-login', path: '/', auth: false, open: clickText('LOG IN') },

    // Pages
    { id: 'selection', path: '/' },
    { id: 'goals', path: r('/goals') },
    { id: 'goal-detail', path: `${r('/goals')}?goal=sweep-goal-ii-v-i` },
    { id: 'goal-detail-completed', path: `${r('/goals')}?goal=sweep-goal-technique` },
    { id: 'sessions', path: r('/sessions') },
    { id: 'session-detail', path: r('/session/sweep-session-0') },
    { id: 'create-session', path: r('/create-session') },
    { id: 'programs', path: r('/programs') },
    { id: 'program-calendar', path: r('/programs/sweep-program') },
    { id: 'analytics', path: r('/analytics') },
    { id: 'notes', path: r('/notes') },
    { id: 'logs', path: r('/logs') },
    { id: 'manage-activities', path: r('/manage-activities') },
    { id: 'manage-templates', path: r('/manage-session-templates') },

    // Settings tabs
    ...['general', 'styling', 'account', 'ai-connections', 'storage'].map((tab) => ({
        id: `settings-${tab}`,
        path: `${r('/goals')}?settings=${tab}`,
        ready: (page) => page.getByRole('dialog', { name: 'Settings' }).waitFor(),
    })),
];

export const VIEWPORTS = {
    'phone-sm': { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    tablet: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    desktop: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
};

export const THEMES = ['light', 'dark'];

export const RESULTS_DIR = 'sweep-results';
export const AUTH_STATE = `${RESULTS_DIR}/.auth.json`;
