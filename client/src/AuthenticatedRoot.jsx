import React, { Suspense, lazy } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import AppRouter from './AppRouter';
import ApplicationProviders from './ApplicationProviders';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import AppToaster from './components/common/AppToaster';
import { DebugProvider, useDebug } from './contexts/DebugContext';
import { installConnectivity } from './offline/connectivity';

installConnectivity();

const ReactQueryDevtools = lazy(() => import('@tanstack/react-query-devtools').then((module) => ({
    default: module.ReactQueryDevtools,
})));

function QueryDevtools() {
    const { debugMode } = useDebug();
    if (!debugMode) return null;
    return (
        <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        </Suspense>
    );
}

export default function AuthenticatedRoot({ queryClient }) {
    return (
        <GlobalErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <DebugProvider>
                        <QueryDevtools />
                        <AppToaster />
                        <ApplicationProviders>
                            <AppRouter />
                        </ApplicationProviders>
                    </DebugProvider>
                </BrowserRouter>
            </QueryClientProvider>
        </GlobalErrorBoundary>
    );
}
