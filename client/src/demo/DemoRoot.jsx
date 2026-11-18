import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { trackPublicEvent } from '../utils/publicTelemetry';
import { getVisitAttribution } from '../utils/visitAttribution';
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
// Read before the guide tidies the address: whether the landing page's tour link opened
// the demo, and the campaign it handed on (utils/visitAttribution.js).
const OPENED_FROM_TOUR = new URLSearchParams(window.location.search).get('tour') === '1';
getVisitAttribution();

const noop = () => {};

function DemoApp() {
    const location = useLocation();
    const { loading, demoError, logout } = useAuth();
    const [signupSource, setSignupSource] = useState(null);
    const isSignupOpen = signupSource !== null;
    const startTracked = useRef(false);
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

    const demoReady = !loading && !demoError && examples.length > 0;
    useEffect(() => {
        if (!demoReady || startTracked.current) return;
        startTracked.current = true;
        const position = examples.findIndex((example) => example.root_id === location.pathname.split('/')[1]);
        trackPublicEvent('demo_started', {
            example_position: position >= 0 ? position : null,
            from_tour: OPENED_FROM_TOUR,
        });
    }, [demoReady, examples, location.pathname]);

    const openSignup = (source) => {
        trackPublicEvent('waitlist_opened', { source });
        setSignupSource(source);
    };

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
                <DemoGuide examples={examples} onSignup={openSignup} onExit={logout} />
                <DemoWriteNotice isSignupOpen={isSignupOpen} />
                {/* Mounted per opening, so each sign-up starts from a fresh form. */}
                {isSignupOpen && <DemoSignupModal isOpen source={signupSource} onClose={() => setSignupSource(null)} />}
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
