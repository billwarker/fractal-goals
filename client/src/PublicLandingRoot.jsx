import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import ApplicationProviders from './ApplicationProviders';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import Landing from './pages/Landing';

export function PublicLandingProviders({ children, queryClient }) {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <ApplicationProviders>{children}</ApplicationProviders>
            </BrowserRouter>
        </QueryClientProvider>
    );
}

export default function PublicLandingRoot({ queryClient }) {
    return (
        <GlobalErrorBoundary>
            <PublicLandingProviders queryClient={queryClient}>
                <Landing />
            </PublicLandingProviders>
        </GlobalErrorBoundary>
    );
}
