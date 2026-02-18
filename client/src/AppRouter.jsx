import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { globalApi, fractalApi } from './utils/api';
import { HeaderProvider, useHeader } from './context/HeaderContext';
import useIsMobile from './hooks/useIsMobile';
import styles from './AppRouter.module.css';
import './App.css';

// Import page components
import Selection from './pages/Selection';
import FractalGoals from './pages/FractalGoals';
import CreateSession from './pages/CreateSession';

// Lazy load non-critical pages
const Programs = lazy(() => import('./pages/Programs'));
const ProgramDetail = lazy(() => import('./pages/ProgramDetail'));
const Sessions = lazy(() => import('./pages/Sessions'));
const SessionDetail = lazy(() => import('./pages/SessionDetail'));
const CreateSessionTemplate = lazy(() => import('./pages/CreateSessionTemplate'));
const ManageActivities = lazy(() => import('./pages/ManageActivities'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Logs = lazy(() => import('./pages/Logs'));

import { usePageTitle } from './hooks/usePageTitle';

const API_URL = 'http://localhost:8000/api/goals';

// Helper functions (from original App.jsx)
const getChildType = (parentType) => {
    const map = {
        'UltimateGoal': 'LongTermGoal',
        'LongTermGoal': 'MidTermGoal',
        'MidTermGoal': 'ShortTermGoal',
        'ShortTermGoal': 'ImmediateGoal',  // Sessions are now separate
        'ImmediateGoal': 'MicroGoal',
        'MicroGoal': 'NanoGoal',
        'NanoGoal': null
    };
    return map[parentType];
};

const getTypeDisplayName = (type) => {
    const names = {
        'UltimateGoal': 'Ultimate Goal',
        'LongTermGoal': 'Long Term Goal',
        'MidTermGoal': 'Mid Term Goal',
        'ShortTermGoal': 'Short Term Goal',
        'ImmediateGoal': 'Immediate Goal',
        'MicroGoal': 'Micro Goal',
        'NanoGoal': 'Nano Goal',
        'Session': 'Session'  // For display purposes
    };
    return names[type] || type;
};

const calculateGoalAge = (createdAt) => {
    if (!createdAt) return null;

    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays >= 365) {
        return `${(diffDays / 365).toFixed(1)}y`;
    } else if (diffDays >= 30 || diffDays > 7) {
        return `${(diffDays / 30.44).toFixed(1)}mo`;
    } else if (diffDays > 6) {
        return `${(diffDays / 7).toFixed(1)}w`;
    } else {
        return `${Math.floor(diffDays)}d`;
    }
};

import SettingsModal from './components/modals/SettingsModal';

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
                                element={<FractalGoals />}
                            />
                            <Route path="/:rootId/programs" element={
                                <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                    <Programs />
                                </Suspense>
                            } />
                            <Route path="/:rootId/programs/:programId" element={
                                <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                    <ProgramDetail />
                                </Suspense>
                            } />
                            <Route path="/:rootId/sessions" element={
                                <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                    <Sessions />
                                </Suspense>
                            } />
                            <Route path="/:rootId/analytics" element={
                                <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                    <Analytics />
                                </Suspense>
                            } />
                            <Route path="/:rootId/logs" element={
                                <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                    <Logs />
                                </Suspense>
                            } />
                            <Route path="/:rootId/session/:sessionId" element={
                                <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                    <SessionDetail />
                                </Suspense>
                            } />
                            <Route path="/:rootId/create-session" element={<CreateSession />} />
                            <Route path="/:rootId/manage-session-templates" element={
                                <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                    <CreateSessionTemplate />
                                </Suspense>
                            } />
                            <Route path="/:rootId/manage-activities" element={
                                <Suspense fallback={<div className="loading-spinner">Loading...</div>}>
                                    <ManageActivities />
                                </Suspense>
                            } />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    )}
                </div>

                {/* Settings Modal */}
                <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

                {/* Environment Indicator */}
                <div className={`env-indicator ${import.meta.env.VITE_ENV || 'development'}`}>
                    {import.meta.env.VITE_ENV || 'development'}
                </div>
            </div>
        </HeaderProvider>
    );
}

export default App;
