import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { fractalApi } from './utils/api';
import { HeaderProvider, useHeader } from './contexts/HeaderContext';
import useIsMobile from './hooks/useIsMobile';
import styles from './AppRouter.module.css';
import './App.css';

// Import page components
import Selection from './pages/Selection';

// Lazy load non-critical pages
const FractalGoals = lazy(() => import('./pages/FractalGoals'));
const Programs = lazy(() => import('./pages/Programs'));
const ProgramDetail = lazy(() => import('./pages/ProgramDetail'));
const Sessions = lazy(() => import('./pages/Sessions'));
const SessionDetail = lazy(() => import('./pages/SessionDetail'));
const CreateSession = lazy(() => import('./pages/CreateSession'));
const CreateSessionTemplate = lazy(() => import('./pages/CreateSessionTemplate'));
const ManageActivities = lazy(() => import('./pages/ManageActivities'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Logs = lazy(() => import('./pages/Logs'));
const SettingsModal = lazy(() => import('./components/modals/SettingsModal'));
import ComponentErrorBoundary from './components/ui/ComponentErrorBoundary';

import { usePageTitle } from './hooks/usePageTitle';

// Navigation header component defined outside of App to avoid re-declaration
const NavigationHeader = ({ onOpenSettings }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { headerActions } = useHeader();
    const [fractalName, setFractalName] = useState('Fractal Goals');
    const [fractalNameCache, setFractalNameCache] = useState({});
    const isMobile = useIsMobile();

    // Extract rootId from current path
    const pathParts = location.pathname.split('/');
    const rootId = pathParts[1]; // First part after /

    useEffect(() => {
        if (rootId && rootId !== 'assets' && rootId !== 'vite.svg' && rootId !== 'session' && rootId !== 'manage-activities' && rootId !== 'manage-session-templates' && rootId !== 'create-session' && rootId !== 'analytics' && rootId !== 'logs') {
            if (fractalNameCache[rootId]) {
                setFractalName(fractalNameCache[rootId]);
            } else {
                fractalApi.getGoal(rootId, rootId) // Fetch root goal to get name
                    .then(res => {
                        if (res.data && res.data.name) {
                            const name = res.data.name;
                            setFractalName(name);
                            // Update cache
                            setFractalNameCache(prev => ({
                                ...prev,
                                [rootId]: name
                            }));
                        }
                    })
                    .catch(err => {
                        console.error('Failed to fetch fractal name:', err);
                    });
            }
        } else if (!rootId || rootId === '') {
            setFractalName('Fractal Goals');
        }
    }, [rootId]); // Remove fractalNameCache from dependencies

    // Only show nav if we're on a fractal page
    if (!rootId || rootId === '') return null;

    const navItems = [
        { path: `/${rootId}/goals`, label: 'GOALS' },
        { path: `/${rootId}/programs`, label: 'PROGRAMS' },
        { path: `/${rootId}/sessions`, label: 'SESSIONS' },
        { path: `/${rootId}/analytics`, label: 'ANALYTICS' },
        { path: `/${rootId}/logs`, label: 'LOGS' }
    ];

    const isActive = (path) => location.pathname.startsWith(path);

    if (isMobile) {
        return (
            <div className="top-nav-links">
                <div className={styles.mobileNav}>
                    <div className={styles.mobileTitleRow}>
                        <span className={`fractal-title ${styles.fractalTitleMobile}`}>{fractalName}</span>
                        <button
                            className={`${styles.addSessionBtn} ${styles.mobileTopAddBtn}`}
                            onClick={() => navigate(`/${rootId}/create-session`)}
                        >
                            + ADD SESSION
                        </button>
                    </div>

                    <div className={styles.mobileControlsRow}>

                        {navItems.map(item => (
                            <button
                                key={item.path}
                                className={`nav-text-link ${styles.mobileBtn} ${isActive(item.path) ? 'active' : ''}`}
                                onClick={() => navigate(item.path)}
                            >
                                {item.label}
                            </button>
                        ))}

                        <button className={`nav-text-link ${styles.mobileBtn}`} onClick={onOpenSettings}>
                            SETTINGS
                        </button>

                        <button className={`nav-text-link home-link ${styles.mobileBtn}`} onClick={() => navigate('/')}>
                            EXIT
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="top-nav-links">
            <div className="nav-group">
                {/* Left Side: Title and Primary Nav */}
                <div className={styles.navContainer}>
                    <span className={`fractal-title ${styles.fractalTitle}`}>{fractalName}</span>

                    <button
                        className={styles.addSessionBtn}
                        onClick={() => navigate(`/${rootId}/create-session`)}
                    >
                        + ADD SESSION
                    </button>

                    {navItems.map(item => (
                        <button
                            key={item.path}
                            className={`nav-text-link ${isActive(item.path) ? 'active' : ''}`}
                            onClick={() => navigate(item.path)}
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
                    <button className="nav-text-link" onClick={onOpenSettings}>
                        {isMobile ? 'SET' : 'SETTINGS'}
                    </button>

                    <div className={`nav-separator ${styles.navSeparator}`}></div>
                    <button className="nav-text-link home-link" onClick={() => navigate('/')}>
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

    return (
        <HeaderProvider>
            <div className="app-container">
                {location.pathname !== '/' && (
                    <NavigationHeader onOpenSettings={() => setIsSettingsOpen(true)} />
                )}

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
                                        <Programs />
                                    </Suspense>
                                </ComponentErrorBoundary>
                            } />
                            <Route path="/:rootId/programs/:programId" element={
                                <ComponentErrorBoundary>
                                    <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                        <ProgramDetail />
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
