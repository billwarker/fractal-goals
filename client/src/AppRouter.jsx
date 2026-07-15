import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Routes, Route, Navigate, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { HeaderProvider, useHeader } from './contexts/HeaderContext';
import { useAuth } from './contexts/AuthContext';
import { useRootGoal } from './hooks/useGoalQueries';
import useIsMobile from './hooks/useIsMobile';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { getViewportMetaContent, shouldAllowZoom } from './utils/viewportMeta';
import styles from './AppRouter.module.css';
import './App.css';
import './app-shell-and-session.css';
import GoalIcon from './components/atoms/GoalIcon';
import { globalApi } from './utils/api';
import { queryKeys } from './hooks/queryKeys';

// Import page components
import Selection from './pages/Selection';
import Landing from './pages/Landing';

// Lazy load non-critical pages
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
const SettingsModal = lazyWithRetry(() => import('./components/modals/SettingsModal'), 'components/modals/SettingsModal');
const ForcePasswordChangeModal = lazyWithRetry(() => import('./components/modals/ForcePasswordChangeModal'), 'components/modals/ForcePasswordChangeModal');
import ComponentErrorBoundary from './components/ui/ComponentErrorBoundary';

import { usePageTitle } from './hooks/usePageTitle';
import { usePageViewTelemetry } from './hooks/usePageViewTelemetry';
import { trackEvent } from './utils/telemetry';
import { dismissGoalDetailsForNavigation } from './utils/navigationEvents';
import { useGoalLevels } from './contexts/GoalLevelsContext';
import { LANDING_PREVIEW_PATH, isLandingPreviewPath, isPublicLandingLocation } from './utils/marketingHost';
import GettingStartedChecklist from './components/onboarding/GettingStartedChecklist';
import NavigationSessionAction from './components/layout/NavigationSessionAction';
import { getFractalDisplay, getFractalSwitchPath } from './utils/fractalNavigation';

export { LANDING_PREVIEW_PATH, isLandingPreviewPath, isPublicLandingLocation, isPublicMarketingHost } from './utils/marketingHost';

function RequireAdmin({ children }) {
    const { user } = useAuth();
    const { rootId } = useParams();

    if (!user?.is_admin) {
        return <Navigate to={rootId ? `/${rootId}/goals` : '/'} replace />;
    }

    return children;
}

function FractalSwitcher({
    rootId,
    rootGoal,
    isFractalRoute,
    isMobile,
    onSwitch,
}) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, isAuthenticated } = useAuth();
    const goalLevels = useGoalLevels();
    const [isOpen, setIsOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState(null);
    const switcherRef = useRef(null);
    const menuRef = useRef(null);
    const userId = user?.id || null;

    const fractalsQuery = useQuery({
        queryKey: queryKeys.fractals(userId),
        queryFn: async () => {
            const res = await globalApi.getAllFractals();
            return res.data || [];
        },
        enabled: Boolean(isFractalRoute && isAuthenticated && userId),
    });

    const fractals = useMemo(() => (
        Array.isArray(fractalsQuery.data) ? fractalsQuery.data : []
    ), [fractalsQuery.data]);
    const switchableFractals = useMemo(() => (
        fractals.filter((fractal) => fractal.id !== rootId)
    ), [fractals, rootId]);
    const currentFractal = fractals.find((fractal) => fractal.id === rootId) || null;
    const currentDisplay = getFractalDisplay(currentFractal, rootGoal, goalLevels);
    const menuId = `fractal-switcher-menu-${rootId}`;
    const updateMenuPosition = useCallback(() => {
        const trigger = switcherRef.current?.querySelector('button');
        if (!trigger) return;

        const rect = trigger.getBoundingClientRect();
        const viewportWidth = window.visualViewport?.width || window.innerWidth;
        const edge = isMobile ? 12 : 16;
        const width = Math.min(420, Math.max(0, viewportWidth - (edge * 2)));
        const left = Math.min(Math.max(rect.left, edge), Math.max(edge, viewportWidth - width - edge));
        setMenuPosition({ left, top: rect.bottom + 8, width });
    }, [isMobile]);

    useEffect(() => {
        if (!isOpen) return undefined;

        const handlePointerDown = (event) => {
            if (!switcherRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const viewport = window.visualViewport;
        window.addEventListener('resize', updateMenuPosition);
        window.addEventListener('scroll', updateMenuPosition, true);
        viewport?.addEventListener('resize', updateMenuPosition);
        viewport?.addEventListener('scroll', updateMenuPosition);
        return () => {
            window.removeEventListener('resize', updateMenuPosition);
            window.removeEventListener('scroll', updateMenuPosition, true);
            viewport?.removeEventListener('resize', updateMenuPosition);
            viewport?.removeEventListener('scroll', updateMenuPosition);
        };
    }, [isOpen, updateMenuPosition]);

    useEffect(() => {
        setIsOpen(false);
    }, [location.pathname]);

    const handleSelectFractal = (nextRootId) => {
        if (!nextRootId || nextRootId === rootId) {
            setIsOpen(false);
            return;
        }

        onSwitch();
        navigate(getFractalSwitchPath(location.pathname, nextRootId));
    };

    return (
        <div className={`${styles.fractalSwitcher} ${isMobile ? styles.fractalSwitcherMobile : ''}`} ref={switcherRef}>
            <button
                type="button"
                className={styles.fractalSwitcherButton}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={menuId}
                aria-label={`Switch fractal. Current fractal: ${currentDisplay.name}`}
                onClick={() => setIsOpen((value) => {
                    if (!value) {
                        updateMenuPosition();
                        onSwitch();
                    }
                    return !value;
                })}
            >
                {currentDisplay.type && (
                    <GoalIcon
                        shape={currentDisplay.shape}
                        color={currentDisplay.color}
                        secondaryColor={currentDisplay.secondaryColor}
                        isSmart={currentDisplay.isSmart}
                        size={isMobile ? 30 : 22}
                        className={styles.fractalTitleIcon}
                    />
                )}
                {!isMobile && (
                    <span className={`fractal-title ${styles.fractalTitle}`}>{currentDisplay.name}</span>
                )}
                <span className={styles.fractalSwitcherChevron} aria-hidden="true">▾</span>
            </button>

            {isOpen && menuPosition && createPortal(
                <div
                    className={`${styles.fractalSwitcherMenu} ${styles.fractalSwitcherMenuPortal}`}
                    id={menuId}
                    ref={menuRef}
                    role="menu"
                    aria-label="Available fractals"
                    style={menuPosition}
                >
                    {fractalsQuery.isLoading && (
                        <div className={styles.fractalSwitcherStatus}>Loading fractals...</div>
                    )}
                    {!fractalsQuery.isLoading && switchableFractals.length === 0 && (
                        <div className={styles.fractalSwitcherStatus}>No other fractals available</div>
                    )}
                    {!fractalsQuery.isLoading && switchableFractals.map((fractal) => {
                        const display = getFractalDisplay(fractal, null, goalLevels);
                        return (
                            <button
                                key={fractal.id}
                                type="button"
                                role="menuitem"
                                className={styles.fractalSwitcherItem}
                                onClick={() => handleSelectFractal(fractal.id)}
                            >
                                <GoalIcon
                                    shape={display.shape}
                                    color={display.color}
                                    secondaryColor={display.secondaryColor}
                                    isSmart={display.isSmart}
                                    size={22}
                                    className={styles.fractalSwitcherItemIcon}
                                />
                                <span className={`fractal-title ${styles.fractalTitle} ${styles.fractalSwitcherItemName}`}>
                                    {display.name}
                                </span>
                            </button>
                        );
                    })}
                </div>,
                document.body,
            )}
        </div>
    );
}

// Navigation header component defined outside of App to avoid re-declaration
export const NavigationHeader = ({ onOpenSettings, onHeightChange }) => {
    const location = useLocation();
    const { headerActions } = useHeader();
    const { user } = useAuth();
    const isMobile = useIsMobile();
    const navRef = useRef(null);
    // Event logs are platform telemetry surfaced through the admin usage
    // dashboard; the Logs page is admin-only.
    const showLogsNav = Boolean(user?.is_admin);

    const pathParts = location.pathname.split('/');
    const rootId = pathParts[1]; // First part after /

    const isFractalRoute = Boolean(
        rootId &&
        !['', 'admin', 'assets', 'vite.svg', 'session', 'manage-activities', 'manage-session-templates', 'create-session', 'analytics', 'logs'].includes(rootId)
    );

    const { data: rootGoal } = useRootGoal(rootId, { enabled: isFractalRoute });
    useEffect(() => {
        if (typeof onHeightChange !== 'function') {
            return undefined;
        }

        const navElement = navRef.current;
        if (!navElement) {
            onHeightChange(0);
            return undefined;
        }

        const updateHeight = () => {
            onHeightChange(Math.ceil(navElement.getBoundingClientRect().height));
        };

        updateHeight();

        if (typeof ResizeObserver === 'function') {
            const observer = new ResizeObserver(updateHeight);
            observer.observe(navElement);
            return () => {
                observer.disconnect();
                onHeightChange(0);
            };
        }

        window.addEventListener('resize', updateHeight);
        return () => {
            window.removeEventListener('resize', updateHeight);
            onHeightChange(0);
        };
    }, [headerActions, isMobile, location.pathname, onHeightChange]);

    // Only show nav if we're on a fractal page
    if (!rootId || rootId === '') return null;

    const primaryNavItems = [
        { path: `/${rootId}/goals`, label: 'GOALS' },
        { path: `/${rootId}/programs`, label: 'PROGRAMS' },
        { path: `/${rootId}/sessions`, label: 'SESSIONS' },
        { path: `/${rootId}/notes`, label: 'NOTES' },
        { path: `/${rootId}/analytics`, label: 'ANALYTICS' }
    ];
    const logsNavItem = { path: `/${rootId}/logs`, label: 'LOGS' };

    const isActive = (path) => location.pathname.startsWith(path);
    const handleRouteLinkClick = () => {
        dismissGoalDetailsForNavigation();
    };
    const handleOpenSettings = () => {
        dismissGoalDetailsForNavigation();
        onOpenSettings();
    };
    const handleSwitchFractal = () => {
        dismissGoalDetailsForNavigation();
    };

    if (isMobile) {
        return (
            <>
                <div className="top-nav-links" ref={navRef}>
                    <div className={styles.mobileNav}>
                        <FractalSwitcher
                            rootId={rootId}
                            rootGoal={rootGoal}
                            isFractalRoute={isFractalRoute}
                            isMobile
                            onSwitch={handleSwitchFractal}
                        />
                        <NavigationSessionAction rootId={rootId} userId={user?.id} isMobile onClick={handleRouteLinkClick} />
                        <nav className={styles.mobilePrimaryNav} aria-label="Primary">
                            {primaryNavItems.map(item => (
                                <Link key={item.path} to={item.path} aria-current={isActive(item.path) ? 'page' : undefined} className={isActive(item.path) ? styles.mobilePrimaryActive : ''} onClick={handleRouteLinkClick}>
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                        <button className={`nav-text-link ${styles.mobileBtn}`} onClick={handleOpenSettings}>
                            SETTINGS
                        </button>
                        <Link className={`nav-text-link home-link ${styles.mobileBtn}`} to="/" onClick={handleRouteLinkClick}>
                            EXIT
                        </Link>
                    </div>
                </div>
            </>
        );
    }

    return (
        <div className="top-nav-links" ref={navRef}>
            <div className="nav-group">
                {/* Left Side: Title and Primary Nav */}
                <div className={styles.navContainer}>
                    <FractalSwitcher
                        rootId={rootId}
                        rootGoal={rootGoal}
                        isFractalRoute={isFractalRoute}
                        onSwitch={handleSwitchFractal}
                    />

                    <NavigationSessionAction rootId={rootId} userId={user?.id} onClick={handleRouteLinkClick} />

                    {primaryNavItems.map(item => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`nav-text-link ${isActive(item.path) ? 'active' : ''}`}
                            onClick={handleRouteLinkClick}
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>

                {/* Right Side: Actions and Exit */}
                <div className={styles.navContainerRight}>
                    {/* Render Page Specific Actions */}
                    {!isMobile && headerActions && (
                        <>
                            <div className={`nav-separator ${styles.navSeparator}`}></div>
                            {headerActions}
                        </>
                    )}

                    {showLogsNav && (
                        <>
                            <div className={`nav-separator ${styles.navSeparator}`}></div>
                            <Link
                                to={logsNavItem.path}
                                className={`nav-text-link ${isActive(logsNavItem.path) ? 'active' : ''}`}
                                onClick={handleRouteLinkClick}
                            >
                                {logsNavItem.label}
                            </Link>
                        </>
                    )}

                    <div className={`nav-separator ${styles.navSeparator}`}></div>
                    <button className="nav-text-link" onClick={handleOpenSettings}>
                        {isMobile ? 'SET' : 'SETTINGS'}
                    </button>

                    <div className={`nav-separator ${styles.navSeparator}`}></div>
                    <Link className="nav-text-link home-link" to="/" onClick={handleRouteLinkClick}>
                        {isMobile ? 'EXIT' : 'EXIT TO HOME'}
                    </Link>
                </div>
            </div>
        </div>
    );
};

function App() {
    const location = useLocation();
    const { user, isAuthenticated } = useAuth();
    const mustChangePassword = Boolean(isAuthenticated && user?.must_change_password);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const isMobile = useIsMobile();
    const [navHeight, setNavHeight] = useState(() => (location.pathname === '/' ? 0 : (isMobile ? 56 : 60)));
    const adminParams = new URLSearchParams(location.search);
    const adminMode = adminParams.get('admin_mode');
    const adminUserId = adminParams.get('admin_user_id');
    const redirectDeprecatedLandingRoute = location.pathname === '/landing' || (
        location.pathname === LANDING_PREVIEW_PATH && !isLandingPreviewPath(location.pathname)
    );
    const showLandingPage = isPublicLandingLocation(location.pathname);
    const showSelectionPage = location.pathname === '/' && !showLandingPage;

    // Determine page title based on path
    const getPageTitle = (pathname) => {
        if (showLandingPage || redirectDeprecatedLandingRoute) return 'Private Beta';
        if (pathname === '/') return 'Selection';
        if (pathname === '/admin') return 'Admin';
        if (pathname === '/reset-password') return 'Reset Password';
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
                {mustChangePassword && (
                    <Suspense fallback={null}>
                        <ForcePasswordChangeModal />
                    </Suspense>
                )}
                {!showSelectionPage && !showLandingPage && !redirectDeprecatedLandingRoute && location.pathname !== '/admin' && location.pathname !== '/reset-password' && (
                    <NavigationHeader
                        onOpenSettings={() => {
                            trackEvent('settings_opened');
                            setIsSettingsOpen(true);
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
                        <Landing />
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

                {!showSelectionPage && !showLandingPage && isAuthenticated && <GettingStartedChecklist />}

                <div className={`env-indicator ${import.meta.env.VITE_ENV || 'development'}`}>
                    {import.meta.env.VITE_ENV || 'development'}
                </div>
            </div>
        </HeaderProvider>
    );
}

export default App;
