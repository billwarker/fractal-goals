import React, { useEffect, useMemo, useState } from 'react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter, Navigate, useLocation } from 'react-router-dom';
import ApplicationProviders from '../ApplicationProviders';
import FractalRoutes from '../FractalRoutes';
import GlobalErrorBoundary from '../components/GlobalErrorBoundary';
import AppToaster from '../components/common/AppToaster';
import EmptyState from '../components/common/EmptyState';
import LoadingState from '../components/common/LoadingState';
import { NavigationHeader } from '../components/layout/NavigationHeader';
import { DemoAuthProvider, useAuth } from '../contexts/AuthContext';
import { HeaderProvider } from '../contexts/HeaderContext';
import { queryKeys } from '../hooks/queryKeys';
import { usePageTitle } from '../hooks/usePageTitle';
import { installConnectivity } from '../offline/connectivity';
import { fetchLandingExamples, LANDING_EXAMPLES_STALE_TIME } from '../utils/landingPrefetch';
import { getLandingPageHref } from '../utils/marketingHost';
import DemoGuide from './DemoGuide';
import DemoSignupModal from './DemoSignupModal';
import DemoWriteNotice from './DemoWriteNotice';
import { sortDemoExamples } from './demoExamples';
import { DEMO_BASE_PATH, setDemoMode } from './demoMode';
import '../App.css';
import '../app-shell-and-session.css';

// Before anything renders: the API layer refuses writes from here on.
setDemoMode(true);
installConnectivity();

const noop = () => {};

function DemoApp() {
    const location = useLocation();
    const { loading, demoError, logout } = useAuth();
    const [isSignupOpen, setIsSignupOpen] = useState(false);
    const [navHeight, setNavHeight] = useState(60);
    usePageTitle('Live demo');

    // The published examples: which snapshot fractals the demo tours, and where the tour goes.
    const examplesQuery = useQuery({
        queryKey: queryKeys.landingExamples(),
        queryFn: fetchLandingExamples,
        staleTime: LANDING_EXAMPLES_STALE_TIME,
    });
    const examples = useMemo(() => sortDemoExamples(examplesQuery.data), [examplesQuery.data]);

    useEffect(() => {
        document.documentElement.style.setProperty('--app-nav-height', `${navHeight}px`);
    }, [navHeight]);

    if (loading || examplesQuery.isPending) {
        return <LoadingState variant="page" label="Opening the demo…" />;
    }
    if (demoError || examples.length === 0) {
        return (
            <EmptyState
                title="The demo isn’t available right now"
                description="Please try again in a moment."
                actionLabel="Back to Fractal Goals"
                onAction={() => window.location.assign(getLandingPageHref())}
            />
        );
    }

    const firstGoalsPath = `/${examples[0].root_id}/goals`;
    if (location.pathname === '/' || location.pathname === '') {
        return <Navigate to={`${firstGoalsPath}${location.search || ''}`} replace />;
    }

    return (
        <HeaderProvider>
            <div className="app-container" data-demo>
                <NavigationHeader onOpenSettings={noop} onOpenAgent={noop} onHeightChange={setNavHeight} />
                <div className="content-container">
                    <FractalRoutes fallbackPath={firstGoalsPath} />
                </div>
                <DemoGuide examples={examples} onSignup={() => setIsSignupOpen(true)} onExit={logout} />
                <DemoWriteNotice onSignup={() => setIsSignupOpen(true)} isSignupOpen={isSignupOpen} />
                {/* Mounted per opening, so each sign-up starts from a fresh form. */}
                {isSignupOpen && <DemoSignupModal isOpen onClose={() => setIsSignupOpen(false)} />}
            </div>
        </HeaderProvider>
    );
}

// The live demo: the real app, read-only, on the published landing examples.
export default function DemoRoot({ queryClient }) {
    return (
        <GlobalErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter basename={DEMO_BASE_PATH}>
                    <AppToaster />
                    <ApplicationProviders authProvider={DemoAuthProvider}>
                        <DemoApp />
                    </ApplicationProviders>
                </BrowserRouter>
            </QueryClientProvider>
        </GlobalErrorBoundary>
    );
}
