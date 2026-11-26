import { NavigationHeader } from './components/layout/NavigationHeader';
export { NavigationHeader } from './components/layout/NavigationHeader';
import React, { useState, useEffect, Suspense, useSyncExternalStore } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
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
const Admin = lazyWithRetry(() => import('./pages/Admin'), 'pages/Admin');
const UpdateRequiredScreen = lazyWithRetry(() => import('./platform/UpdateRequiredScreen'), 'platform/UpdateRequiredScreen');
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword'), 'pages/ResetPassword');
const Legal = lazyWithRetry(() => import('./pages/Legal'), 'pages/Legal');
const StorageConnected = lazyWithRetry(() => import('./pages/StorageConnected'), 'pages/StorageConnected');
const NativeShellBridge = lazyWithRetry(() => import('./platform/NativeShellBridge'), 'platform/NativeShellBridge');

const LEGAL_PATHS = ['/privacy', '/terms'];
const SettingsModal = lazyWithRetry(() => import('./components/modals/SettingsModal'), 'components/modals/SettingsModal');
const AgentChatPopover = lazyWithRetry(() => import('./components/agent/AgentChatPopover'), 'components/agent/AgentChatPopover');
const ForcePasswordChangeModal = lazyWithRetry(() => import('./components/modals/ForcePasswordChangeModal'), 'components/modals/ForcePasswordChangeModal');
const LegalAcceptanceModal = lazyWithRetry(() => import('./components/modals/LegalAcceptanceModal'), 'components/modals/LegalAcceptanceModal');
import ComponentErrorBoundary from './components/ui/ComponentErrorBoundary';
import RouteFallback from './components/common/RouteFallback';
import FractalRoutes from './FractalRoutes';

import { usePageTitle } from './hooks/usePageTitle';
import { usePageViewTelemetry } from './hooks/usePageViewTelemetry';
import { trackEvent } from './utils/telemetry';
import { LANDING_PREVIEW_PATH, isLandingPreviewPath, isPublicLandingLocation } from './utils/marketingHost';
import GettingStartedChecklist from './components/onboarding/GettingStartedChecklist';
import AgentChangeSubscription from './components/agent/AgentChangeSubscription';
import GoalChangeAnnouncer from './components/goals/GoalChangeAnnouncer';
import SessionSyncIndicator from './components/sessionDetail/SessionSyncIndicator';
import OfflineSignInScreen from './offline/OfflineSignInScreen';
import { installAppLinks, isNative } from './platform';
import { isUpdateRequired, subscribeUpdateRequired } from './platform/updateRequired';
import { useIsOnline } from './offline/useIsOnline';

export { RequireAdmin } from './FractalRoutes';
export { LANDING_PREVIEW_PATH, isLandingPreviewPath, isPublicLandingLocation, isPublicMarketingHost } from './utils/marketingHost';

const appEnvironment = import.meta.env.VITE_ENV || 'development';
const STORAGE_CONNECTED_PATH = '/storage/connected';
// Full-page routes outside a fractal: no navigation header or fractal agent shell.
const STANDALONE_PATHS = new Set(['/admin', '/reset-password', STORAGE_CONNECTED_PATH]);

function App() {
    const location = useLocation();
    const { user, isAuthenticated, loading: authLoading } = useAuth();
    const online = useIsOnline();
    const updateRequired = useSyncExternalStore(subscribeUpdateRequired, isUpdateRequired);
    const mustChangePassword = Boolean(isAuthenticated && user?.must_change_password);
    const legalAcceptanceRequired = Boolean(isAuthenticated && user?.legal_acceptance_required);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settingsTab, setSettingsTab] = useState(null);
    const navigate = useNavigate();
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
    const openSettings = () => {
        trackEvent('settings_opened');
        setIsSettingsOpen(true);
    };
    const activeRootId = location.pathname.split('/')[1] || '';
    const agentShellAvailable = isAuthenticated && Boolean(activeRootId)
        && !showSelectionPage
        && !showLandingPage
        && !showLegalPage
        && !redirectDeprecatedLandingRoute
        && !STANDALONE_PATHS.has(location.pathname);

    useEffect(() => installAppLinks(navigate), [navigate]);

    // `?settings=<tab>` deep-links into Settings (e.g. from the cloud storage return page).
    // Each navigation has its own key, so the same link can open Settings again later.
    const requestedSettingsTab = isAuthenticated ? new URLSearchParams(location.search).get('settings') : null;
    const [settingsRequestKey, setSettingsRequestKey] = useState(null);
    if (requestedSettingsTab && settingsRequestKey !== location.key) {
        setSettingsRequestKey(location.key);
        setSettingsTab(requestedSettingsTab);
        setIsSettingsOpen(true);
    }
    useEffect(() => {
        if (!requestedSettingsTab) return;
        const params = new URLSearchParams(location.search);
        params.delete('settings');
        const query = params.toString();
        navigate({ pathname: location.pathname, search: query ? `?${query}` : '' }, { replace: true });
    }, [requestedSettingsTab, location.pathname, location.search, navigate]);

    // Determine page title based on path
    const getPageTitle = (pathname) => {
        if (showLandingPage || redirectDeprecatedLandingRoute) return 'Private Beta';
        if (pathname === '/') return 'Selection';
        if (pathname === '/admin') return 'Admin';
        if (pathname === '/reset-password') return 'Reset Password';
        if (pathname === STORAGE_CONNECTED_PATH) return 'Cloud Storage';
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
                {isAuthenticated ? <GoalChangeAnnouncer /> : null}
                {/* The Mac app's menus, menu-bar timer and reminders. */}
                {isAuthenticated && isNative && (
                    <Suspense fallback={null}><NativeShellBridge onOpenSettings={openSettings} /></Suspense>
                )}
                {/* Session Detail shows its own indicator; elsewhere this tracks every queued change. */}
                {isAuthenticated && !/^\/[^/]+\/session\/[^/]+/.test(location.pathname) && (
                    <SessionSyncIndicator idleOfflineLabel="Offline" className={styles.globalSyncSlot} />
                )}
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
                {!showSelectionPage && !showLandingPage && !showLegalPage && !redirectDeprecatedLandingRoute && !STANDALONE_PATHS.has(location.pathname) && (
                    <NavigationHeader
                        onOpenSettings={openSettings}
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
                    {updateRequired ? (
                        <Suspense fallback={<RouteFallback />}><UpdateRequiredScreen /></Suspense>
                    ) : !isAuthenticated && !authLoading && !online && !showLandingPage && !showLegalPage ? (
                        <OfflineSignInScreen />
                    ) : redirectDeprecatedLandingRoute ? (
                        <Navigate to="/" replace />
                    ) : showLandingPage ? (
                        <Suspense fallback={<RouteFallback />}><Landing /></Suspense>
                    ) : showLegalPage ? (
                        <ComponentErrorBoundary>
                            <Suspense fallback={<RouteFallback />}>
                                <Legal />
                            </Suspense>
                        </ComponentErrorBoundary>
                    ) : showSelectionPage ? (
                        <Selection onOpenSettings={openSettings} />
                    ) : location.pathname === '/admin' ? (
                        <ComponentErrorBoundary>
                            <Suspense fallback={<RouteFallback />}>
                                <Admin />
                            </Suspense>
                        </ComponentErrorBoundary>
                    ) : location.pathname === '/reset-password' ? (
                        <ComponentErrorBoundary>
                            <Suspense fallback={<RouteFallback />}>
                                <ResetPassword />
                            </Suspense>
                        </ComponentErrorBoundary>
                    ) : location.pathname === STORAGE_CONNECTED_PATH ? (
                        <ComponentErrorBoundary>
                            <Suspense fallback={<RouteFallback />}>
                                <StorageConnected />
                            </Suspense>
                        </ComponentErrorBoundary>
                    ) : (
                        <FractalRoutes />
                    )}
                </div>

                {/* Settings Modal */}
                <Suspense fallback={null}>
                    {isSettingsOpen && (
                        <SettingsModal
                            isOpen={isSettingsOpen}
                            initialTab={settingsTab}
                            inFractal={!showSelectionPage}
                            onClose={() => { setIsSettingsOpen(false); setSettingsTab(null); }}
                        />
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
