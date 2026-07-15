import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { isPublicLandingLocation } from './utils/marketingHost';
import { dismissLandingBootShell } from './utils/landingBootHandoff';
import { maybePrefetchLandingExamples } from './utils/landingPrefetch';
import './index.css';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60,
            gcTime: 1000 * 60 * 5,
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

const isPublicLanding = isPublicLandingLocation();

// Preserve the HTML-parse snapshot head start while the route-specific React
// bundle downloads. The query uses the same key in Landing, so it deduplicates.
maybePrefetchLandingExamples(queryClient);

const loadApplication = isPublicLanding
    ? import('./PublicLandingRoot')
    : import('./AuthenticatedRoot');

const rootElement = document.getElementById('root');
if (!isPublicLanding) dismissLandingBootShell();
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
