import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { HeaderProvider, useHeader } from './contexts/HeaderContext';
import { useRootGoal } from './hooks/useGoalQueries';
import useIsMobile from './hooks/useIsMobile';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { getViewportMetaContent, shouldAllowZoom } from './utils/viewportMeta';
import styles from './AppRouter.module.css';
import './App.css';

// Import page components
import Selection from './pages/Selection';

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
const SettingsModal = lazyWithRetry(() => import('./components/modals/SettingsModal'), 'components/modals/SettingsModal');
import ComponentErrorBoundary from './components/ui/ComponentErrorBoundary';

import { usePageTitle } from './hooks/usePageTitle';
import { dismissGoalDetailsForNavigation } from './utils/navigationEvents';

// Navigation header component defined outside of App to avoid re-declaration
const NavigationHeader = ({ onOpenSettings, onHeightChange }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { headerActions } = useHeader();
    const isMobile = useIsMobile();
    const navRef = useRef(null);

    // Extract rootId from current path
    const pathParts = location.pathname.split('/');
    const rootId = pathParts[1]; // First part after /

    const isFractalRoute = Boolean(
        rootId &&
        !['', 'assets', 'vite.svg', 'session', 'manage-activities', 'manage-session-templates', 'create-session', 'analytics', 'logs'].includes(rootId)
    );

    const { data: rootGoal } = useRootGoal(rootId, { enabled: isFractalRoute });
    const fractalName = rootGoal?.name || 'Fractal Goals';

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
    const handleNavigate = (path) => {
        dismissGoalDetailsForNavigation();
        navigate(path);
    };
    const handleOpenSettings = () => {
        dismissGoalDetailsForNavigation();
        onOpenSettings();
    };

    if (isMobile) {
        return (
            <div className="top-nav-links" ref={navRef}>
                <div className={styles.mobileNav}>
                    <div className={styles.mobileControlsRow}>
                        <button
                            className={`${styles.addSessionBtn} ${styles.mobileBtn} ${styles.mobileTopAddBtn}`}
                            onClick={() => handleNavigate(`/${rootId}/create-session`)}
                        >
                            + ADD SESSION
                        </button>

                        {primaryNavItems.map(item => (
                            <button
                                key={item.path}
                                className={`nav-text-link ${styles.mobileBtn} ${isActive(item.path) ? 'active' : ''}`}
                                onClick={() => handleNavigate(item.path)}
                            >
                                {item.label}
                            </button>
                        ))}

                        <button
                            className={`nav-text-link ${styles.mobileBtn} ${isActive(logsNavItem.path) ? 'active' : ''}`}
                            onClick={() => handleNavigate(logsNavItem.path)}
                        >
                            {logsNavItem.label}
                        </button>

                        <button className={`nav-text-link ${styles.mobileBtn}`} onClick={handleOpenSettings}>
                            SETTINGS
                        </button>

                        <button className={`nav-text-link home-link ${styles.mobileBtn}`} onClick={() => handleNavigate('/')}>
                            EXIT
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="top-nav-links" ref={navRef}>
            <div className="nav-group">
                {/* Left Side: Title and Primary Nav */}
                <div className={styles.navContainer}>
                    <span className={`fractal-title ${styles.fractalTitle}`}>{fractalName}</span>

                    <button
                        className={styles.addSessionBtn}
                        onClick={() => handleNavigate(`/${rootId}/create-session`)}
                    >
                        + ADD SESSION
                    </button>

                    {primaryNavItems.map(item => (
                        <button
                            key={item.path}
                            className={`nav-text-link ${isActive(item.path) ? 'active' : ''}`}
                            onClick={() => handleNavigate(item.path)}
                        >
                            {item.label}
                        </button>
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

                    <div className={`nav-separator ${styles.navSeparator}`}></div>
                    <button
                        className={`nav-text-link ${isActive(logsNavItem.path) ? 'active' : ''}`}
                        onClick={() => handleNavigate(logsNavItem.path)}
                    >
                        {logsNavItem.label}
                    </button>

                    <div className={`nav-separator ${styles.navSeparator}`}></div>
                    <button className="nav-text-link" onClick={handleOpenSettings}>
                        {isMobile ? 'SET' : 'SETTINGS'}
                    </button>

                    <div className={`nav-separator ${styles.navSeparator}`}></div>
                    <button className="nav-text-link home-link" onClick={() => handleNavigate('/')}>
                        {isMobile ? 'EXIT' : 'EXIT TO HOME'}
                    </button>
                </div>
            </div>
        </div>
    );
};

function App() {
    const location = useLocation();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const isMobile = useIsMobile();
    const [navHeight, setNavHeight] = useState(() => (location.pathname === '/' ? 0 : (isMobile ? 56 : 60)));

    // Determine page title based on path
    const getPageTitle = (pathname) => {
        if (pathname === '/') return 'Selection';
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
                {location.pathname !== '/' && (
                    <NavigationHeader
                        onOpenSettings={() => setIsSettingsOpen(true)}
                        onHeightChange={setNavHeight}
                    />
                )}
                {location.pathname !== '/' ? <div aria-hidden="true" style={{ height: navHeight, flexShrink: 0 }} /> : null}

                <div className="content-container">
                    {location.pathname === '/' ? (
                        <Selection />
                    ) : (
                        <Routes>
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
                                <ComponentErrorBoundary>
                                    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                        <Logs />
                                    </Suspense>
                                </ComponentErrorBoundary>
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

                {/* Environment Indicator */}
                <div className={`env-indicator ${import.meta.env.VITE_ENV || 'development'}`}>
                    {import.meta.env.VITE_ENV || 'development'}
                </div>
            </div>
        </HeaderProvider>
    );
}

export default App;
