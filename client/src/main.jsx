import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { isPublicLandingLocation } from './utils/marketingHost';
import { dismissLandingBootShell } from './utils/landingBootHandoff';
import { dismissAppBootShell, handoffAppBootShell } from './utils/appBootHandoff';
import { maybePrefetchLandingExamples } from './utils/landingPrefetch';
import { isDemoLocation } from './demo/demoMode';
import './index.css';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60,
            gcTime: 1000 * 60 * 5,
            retry: 1,
            refetchOnWindowFocus: false,
            // Serve cached data while offline instead of parking queries in a paused state.
            networkMode: 'offlineFirst',
        },
        // Fail now rather than hold a write in memory and send it, perhaps a delete, whenever signal
        // returns. Writes that can wait are queued on the device (src/offline).
        mutations: { networkMode: 'always' },
    },
});

const isPublicLanding = isPublicLandingLocation();
// The live demo: the real app, read-only, on the published examples (src/demo/).
const isDemo = !isPublicLanding && isDemoLocation();

// Preserve the HTML-parse snapshot head start while the route-specific React
// bundle downloads. The query uses the same key in Landing, so it deduplicates.
maybePrefetchLandingExamples(queryClient);

// One import per branch, outside a ternary: as a ternary the minifier folded both
// into a single preload carrying only AuthenticatedRoot's dependencies, so the
// public landing never requested its own stylesheet.
let loadApplication;
if (isPublicLanding) loadApplication = import('./PublicLandingRoot');
else if (isDemo) loadApplication = import('./demo/DemoRoot');
else loadApplication = import('./AuthenticatedRoot');

const rootElement = document.getElementById('root');
if (isPublicLanding) dismissAppBootShell();
else {
    dismissLandingBootShell();
    handoffAppBootShell(rootElement);
}
const root = createRoot(rootElement);

loadApplication
    .then(({ default: ApplicationRoot }) => {
        root.render(createElement(
            StrictMode,
            null,
            createElement(ApplicationRoot, { queryClient }),
        ));
    })
    .catch((error) => {
        console.error('Application bootstrap failed:', error);
        dismissLandingBootShell();
        dismissAppBootShell();
        rootElement.innerHTML = `
            <main class="boot-error" role="alert">
                <h1>Unable to load Fractal Goals</h1>
                <p>Check your connection and refresh the page.</p>
            </main>
        `;
    });

if (import.meta.env.VITE_SENTRY_DSN) {
    const startMonitoring = () => import('./utils/monitoring').then(
        ({ initializeMonitoring }) => initializeMonitoring(import.meta.env.VITE_SENTRY_DSN),
    );
    if (isPublicLanding && 'requestIdleCallback' in window) {
        window.requestIdleCallback(startMonitoring, { timeout: 4000 });
    } else if (isPublicLanding) {
        window.setTimeout(startMonitoring, 2000);
    } else {
        startMonitoring();
    }
}
