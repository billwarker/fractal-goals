import React, { Suspense, lazy } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppRouter from './AppRouter';
import ApplicationProviders from './ApplicationProviders';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import { DebugProvider, useDebug } from './contexts/DebugContext';

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
                        <Toaster
                            position="bottom-center"
                            toastOptions={{
                                style: {
                                    background: 'var(--color-bg-card)',
                                    color: 'var(--color-text-primary)',
                                    border: '1px solid var(--color-border)',
                                },
                                success: {
                                    duration: 3000,
                                    iconTheme: { primary: 'var(--color-brand-success)', secondary: '#fff' },
                                },
                                error: {
                                    duration: 5000,
                                    iconTheme: { primary: 'var(--color-brand-danger)', secondary: '#fff' },
                                },
                            }}
                        />
                        <ApplicationProviders>
                            <AppRouter />
                        </ApplicationProviders>
                    </DebugProvider>
                </BrowserRouter>
            </QueryClientProvider>
        </GlobalErrorBoundary>
    );
}
