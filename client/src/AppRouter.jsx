import { NavigationHeader } from './components/layout/NavigationHeader';
export { NavigationHeader } from './components/layout/NavigationHeader';
import React, { useState, useEffect, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { HeaderProvider } from './contexts/HeaderContext';
import { useAuth } from './contexts/AuthContext';
import useIsMobile from './hooks/useIsMobile';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { getViewportMetaContent, shouldAllowZoom } from './utils/viewportMeta';
import styles from './AppRouter.module.css';
import './App.css';
import './app-shell-and-session.css';

// Import page components
import Selection from './pages/Selection';

// Lazy load non-critical pages
const Landing = lazyWithRetry(() => import('./pages/Landing'), 'pages/Landing');
const FractalGoals = lazyWithRetry(() => import('./pages/FractalGoals'), 'pages/FractalGoals');
const ProgramCalendarPage = lazyWithRetry(() => import('./pages/ProgramCalendarPage'), 'pages/ProgramCalendarPage');
const Sessions = lazyWithRetry(() => import('./pages/Sessions'), 'pages/Sessions');
const SessionDetail = lazyWithRetry(() => import('./pages/SessionDetail'), 'pages/SessionDetail');
const CreateSession = lazyWithRetry(() => import('./pages/CreateSession'), 'pages/CreateSession');
const CreateSessionTemplate = lazyWithRetry(() => import('./pages/CreateSessionTemplate'), 'pages/CreateSessionTemplate');
const ManageActivities = lazyWithRetry(() => import('./pages/ManageActivities'), 'pages/ManageActivities');
const Analytics = lazyWithRetry(() => import('./pages/Analytics'), 'pages/Analytics');
const Logs = lazyWithRetry(() => import('./pages/Logs'), 'pages/Logs');
const Notes = lazyWithRetry(() => import('./pages/Notes'), 'pages/Notes');
const Admin = lazyWithRetry(() => import('./pages/Admin'), 'pages/Admin');
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword'), 'pages/ResetPassword');
const Legal = lazyWithRetry(() => import('./pages/Legal'), 'pages/Legal');

const LEGAL_PATHS = ['/privacy', '/terms'];
const SettingsModal = lazyWithRetry(() => import('./components/modals/SettingsModal'), 'components/modals/SettingsModal');
const AgentChatPopover = lazyWithRetry(() => import('./components/agent/AgentChatPopover'), 'components/agent/AgentChatPopover');
const ForcePasswordChangeModal = lazyWithRetry(() => import('./components/modals/ForcePasswordChangeModal'), 'components/modals/ForcePasswordChangeModal');
const LegalAcceptanceModal = lazyWithRetry(() => import('./components/modals/LegalAcceptanceModal'), 'components/modals/LegalAcceptanceModal');
import ComponentErrorBoundary from './components/ui/ComponentErrorBoundary';

import { usePageTitle } from './hooks/usePageTitle';
import { usePageViewTelemetry } from './hooks/usePageViewTelemetry';
import { trackEvent } from './utils/telemetry';
import { LANDING_PREVIEW_PATH, isLandingPreviewPath, isPublicLandingLocation } from './utils/marketingHost';
import GettingStartedChecklist from './components/onboarding/GettingStartedChecklist';
import AgentChangeSubscription from './components/agent/AgentChangeSubscription';

export { LANDING_PREVIEW_PATH, isLandingPreviewPath, isPublicLandingLocation, isPublicMarketingHost } from './utils/marketingHost';

function RequireAdmin({ children }) {
    const { user } = useAuth();
    const { rootId } = useParams();

    if (!user?.is_admin) {
        return <Navigate to={rootId ? `/${rootId}/goals` : '/'} replace />;
    }

    return children;
}

const appEnvironment = import.meta.env.VITE_ENV || 'development';

function App() {
    const location = useLocation();
    const { user, isAuthenticated } = useAuth();
    const mustChangePassword = Boolean(isAuthenticated && user?.must_change_password);
    const legalAcceptanceRequired = Boolean(isAuthenticated && user?.legal_acceptance_required);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAgentChatOpen, setIsAgentChatOpen] = useState(false);
    const [hasOpenedAgentChat, setHasOpenedAgentChat] = useState(false);
    const isMobile = useIsMobile();
    const [navHeight, setNavHeight] = useState(() => (location.pathname === '/' ? 0 : (isMobile ? 56 : 60)));
    const adminParams = new URLSearchParams(location.search);
    const adminMode = adminParams.get('admin_mode');
    const adminUserId = adminParams.get('admin_user_id');
    const redirectDeprecatedLandingRoute = location.pathname === '/landing' || (
        location.pathname === LANDING_PREVIEW_PATH && !isLandingPreviewPath(location.pathname)
    );
    const showLandingPage = isPublicLandingLocation(location.pathname);
    // Legal documents render for signed-out visitors: the signup consent
    // checkbox and the landing footer both link here before an account exists.
    const showLegalPage = LEGAL_PATHS.includes(location.pathname);
    const showSelectionPage = location.pathname === '/' && !showLandingPage;
    const activeRootId = location.pathname.split('/')[1] || '';
    const agentShellAvailable = isAuthenticated && Boolean(activeRootId)
        && !showSelectionPage
        && !showLandingPage
        && !showLegalPage
        && !redirectDeprecatedLandingRoute
        && location.pathname !== '/admin'
        && location.pathname !== '/reset-password';

    // Determine page title based on path
    const getPageTitle = (pathname) => {
        if (showLandingPage || redirectDeprecatedLandingRoute) return 'Private Beta';
        if (pathname === '/') return 'Selection';
        if (pathname === '/admin') return 'Admin';
        if (pathname === '/reset-password') return 'Reset Password';
        if (pathname === '/privacy') return 'Privacy Policy';
        if (pathname === '/terms') return 'Terms of Service';
        if (pathname.includes('/goals')) return 'Goals';
        if (pathname.includes('/programs')) return 'Programs';
        if (pathname.includes('/sessions')) return 'Sessions';
        if (pathname.includes('/session/')) return 'Session Detail';
        if (pathname.includes('/analytics')) return 'Analytics';
        if (pathname.includes('/logs')) return 'Logs';
        if (pathname.includes('/create-session')) return 'Create Session';
        if (pathname.includes('/manage-session-templates')) return 'Manage Templates';
        if (pathname.includes('/manage-activities')) return 'Manage Activities';
        return null;
    };

    usePageTitle(getPageTitle(location.pathname));
    usePageViewTelemetry();

    const allowZoom = shouldAllowZoom({
        isMobile,
        pathname: location.pathname,
    });

    useEffect(() => {
        const viewportMeta = document.querySelector('meta[name="viewport"]');
        if (!viewportMeta) {
            return undefined;
        }

        viewportMeta.setAttribute('content', getViewportMetaContent({
            isMobile,
            allowZoom,
        }));

        return undefined;
    }, [allowZoom, isMobile]);

    useEffect(() => {
        const rootElement = document.documentElement;
        const bodyElement = document.body;

        if (!rootElement || !bodyElement) {
            return undefined;
        }

        const className = 'pinch-zoom-disabled';
        rootElement.classList.toggle(className, !allowZoom);
        bodyElement.classList.toggle(className, !allowZoom);

        if (allowZoom) {
            return () => {
                rootElement.classList.remove(className);
                bodyElement.classList.remove(className);
            };
        }

        const preventGesture = (event) => {
            event.preventDefault();
        };

        const preventPinch = (event) => {
            if (event.touches?.length > 1) {
                event.preventDefault();
            }
        };

        window.addEventListener('gesturestart', preventGesture);
        window.addEventListener('gesturechange', preventGesture);
        window.addEventListener('gestureend', preventGesture);
        document.addEventListener('touchmove', preventPinch, { passive: false });

        return () => {
            rootElement.classList.remove(className);
            bodyElement.classList.remove(className);
            window.removeEventListener('gesturestart', preventGesture);
            window.removeEventListener('gesturechange', preventGesture);
            window.removeEventListener('gestureend', preventGesture);
            document.removeEventListener('touchmove', preventPinch);
        };
    }, [allowZoom]);

    useEffect(() => {
        document.documentElement.style.setProperty('--app-nav-height', `${navHeight}px`);

        return () => {
            document.documentElement.style.setProperty('--app-nav-height', '0px');
        };
    }, [navHeight]);

    return (
        <HeaderProvider>
            <div className="app-container">
                <AgentChangeSubscription rootId={activeRootId} authenticated={isAuthenticated} />
                {mustChangePassword && (
                    <Suspense fallback={null}>
                        <ForcePasswordChangeModal />
                    </Suspense>
                )}
                {!mustChangePassword && legalAcceptanceRequired && (
                    <Suspense fallback={null}>
                        <LegalAcceptanceModal />
                    </Suspense>
                )}
                {!showSelectionPage && !showLandingPage && !showLegalPage && !redirectDeprecatedLandingRoute && location.pathname !== '/admin' && location.pathname !== '/reset-password' && (
                    <NavigationHeader
                        onOpenSettings={() => {
                            trackEvent('settings_opened');
                            setIsSettingsOpen(true);
                        }}
                        onOpenAgent={() => {
                            setHasOpenedAgentChat(true);
                            setIsAgentChatOpen(true);
                        }}
                        onHeightChange={setNavHeight}
                    />
                )}

                <div className="content-container">
                    {adminUserId && adminMode && (
                        <div className={styles.adminModeBanner}>
                            Admin {adminMode === 'read_only' ? 'read-only' : 'read-write'} access
                        </div>
                    )}
                    {redirectDeprecatedLandingRoute ? (
                        <Navigate to="/" replace />
                    ) : showLandingPage ? (
                        <Suspense fallback={<div className="loading-spinner">Loading...</div>}><Landing /></Suspense>
                    ) : showLegalPage ? (
                        <ComponentErrorBoundary>
                            <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                <Legal />
                            </Suspense>
                        </ComponentErrorBoundary>
                    ) : showSelectionPage ? (
                        <Selection />
                    ) : location.pathname === '/admin' ? (
                        <ComponentErrorBoundary>
                            <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                <Admin />
                            </Suspense>
                        </ComponentErrorBoundary>
                    ) : location.pathname === '/reset-password' ? (
                        <ComponentErrorBoundary>
                            <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                <ResetPassword />
                            </Suspense>
                        </ComponentErrorBoundary>
                    ) : (
                        <Routes key={location.pathname}>
                            <Route
                                path="/:rootId/goals"
                                element={
                                    <ComponentErrorBoundary>
                                        <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                            <FractalGoals />
                                        </Suspense>
                                    </ComponentErrorBoundary>
                                }
                            />
                            <Route path="/:rootId/programs" element={
                                <ComponentErrorBoundary>
                                    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                            <ProgramCalendarPage />
                                        </Suspense>
                                    </ComponentErrorBoundary>
                            } />
                            <Route path="/:rootId/programs/:programId" element={
                                <ComponentErrorBoundary>
                                    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                        <ProgramCalendarPage />
                                    </Suspense>
                                </ComponentErrorBoundary>
                            } />
                            <Route path="/:rootId/programs/:programId/blocks" element={
                                <ComponentErrorBoundary>
                                    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                        <ProgramCalendarPage />
                                    </Suspense>
                                </ComponentErrorBoundary>
                            } />
                            <Route path="/:rootId/sessions" element={
                                <ComponentErrorBoundary>
                                    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                        <Sessions />
                                    </Suspense>
                                </ComponentErrorBoundary>
                            } />
                            <Route path="/:rootId/analytics" element={
                                <ComponentErrorBoundary>
                                    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                        <Analytics />
                                    </Suspense>
                                </ComponentErrorBoundary>
                            } />
                            <Route path="/:rootId/notes" element={
                                <ComponentErrorBoundary>
                                    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                        <Notes />
                                    </Suspense>
                                </ComponentErrorBoundary>
                            } />
                            <Route path="/:rootId/logs" element={
                                <RequireAdmin>
                                    <ComponentErrorBoundary>
                                        <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                            <Logs />
                                        </Suspense>
                                    </ComponentErrorBoundary>
                                </RequireAdmin>
                            } />
                            <Route path="/:rootId/session/:sessionId" element={
                                <ComponentErrorBoundary>
                                    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                        <SessionDetail />
                                    </Suspense>
                                </ComponentErrorBoundary>
                            } />
                            <Route path="/:rootId/create-session" element={
                                <ComponentErrorBoundary>
                                    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                        <CreateSession />
                                    </Suspense>
                                </ComponentErrorBoundary>
                            } />
                            <Route path="/:rootId/manage-session-templates" element={
                                <ComponentErrorBoundary>
                                    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                        <CreateSessionTemplate />
                                    </Suspense>
                                </ComponentErrorBoundary>
                            } />
                            <Route path="/:rootId/manage-activities" element={
                                <ComponentErrorBoundary>
                                    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                        <ManageActivities />
                                    </Suspense>
                                </ComponentErrorBoundary>
                            } />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    )}
                </div>

                {/* Settings Modal */}
                <Suspense fallback={null}>
                    {isSettingsOpen && (
                        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
                    )}
                </Suspense>

                <Suspense fallback={null}>
                    {hasOpenedAgentChat && agentShellAvailable && (
                        <AgentChatPopover
                            key={activeRootId}
                            rootId={activeRootId}
                            isOpen={isAgentChatOpen}
                            onClose={() => setIsAgentChatOpen(false)}
                        />
                    )}
                </Suspense>

                {!showSelectionPage && !showLandingPage && isAuthenticated && <GettingStartedChecklist />}

                {appEnvironment !== 'production' && (
                    <div className={`env-indicator ${appEnvironment}`}>
                        {appEnvironment}
                    </div>
                )}
            </div>
        </HeaderProvider>
    );
}

export default App;
