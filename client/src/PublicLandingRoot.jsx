import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import Landing from './pages/Landing';

export default function PublicLandingRoot({ queryClient }) {
    return (
        <GlobalErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <Landing />
                </BrowserRouter>
            </QueryClientProvider>
        </GlobalErrorBoundary>
    );
}
