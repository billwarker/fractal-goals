import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { globalApi, fractalApi } from './utils/api';
import { HeaderProvider, useHeader } from './context/HeaderContext';
import './App.css';

// Import page components
import Selection from './pages/Selection';
import FractalGoals from './pages/FractalGoals';
import Programs from './pages/Programs';
import ProgramDetail from './pages/ProgramDetail';
import Sessions from './pages/Sessions';
import SessionDetail from './pages/SessionDetail';
import CreateSession from './pages/CreateSession';
import CreateSessionTemplate from './pages/CreateSessionTemplate';
import ManageActivities from './pages/ManageActivities';
import Analytics from './pages/Analytics';

const API_URL = 'http://localhost:8000/api/goals';

// Helper functions (from original App.jsx)
const getChildType = (parentType) => {
    const map = {
        'UltimateGoal': 'LongTermGoal',
        'LongTermGoal': 'MidTermGoal',
        'MidTermGoal': 'ShortTermGoal',
        'ShortTermGoal': 'PracticeSession',
        'PracticeSession': 'ImmediateGoal',
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
        'PracticeSession': 'Practice Session',
        'ImmediateGoal': 'Immediate Goal',
        'MicroGoal': 'Micro Goal',
        'NanoGoal': 'Nano Goal'
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

function App() {
    const navigate = useNavigate();
    const location = useLocation();

    const [loading, setLoading] = useState(true);
    const [fractalName, setFractalName] = useState('Fractal Goals');
    const [fractalNameCache, setFractalNameCache] = useState({});

    // Navigation header component
    const NavigationHeader = () => {
        const { headerActions } = useHeader();

        // Extract rootId from current path
        const pathParts = location.pathname.split('/');
        const rootId = pathParts[1]; // First part after /

        // Fetch fractal name on component mount or rootId change
        useEffect(() => {
            if (rootId && rootId !== 'assets' && rootId !== 'vite.svg') {
                if (fractalNameCache[rootId]) {
                    setFractalName(fractalNameCache[rootId]);
                } else {
                    fractalApi.getGoal(rootId, rootId) // Fetch root goal to get name
                        .then(res => {
                            if (res.data && res.data.name) {
                                setFractalName(res.data.name);
                                // Update cache
                                setFractalNameCache(prev => ({
                                    ...prev,
                                    [rootId]: res.data.name
                                }));
                            }
                        })
                        .catch(err => {
                            console.error('Failed to fetch fractal name:', err);
                        });
                }
            } else {
                setFractalName('Fractal Goals');
            }
        }, [rootId]);

        // Only show nav if we're on a fractal page
        if (!rootId || rootId === '') return null;

        const navItems = [
            { path: `/${rootId}/fractal-goals`, label: 'FRACTAL VIEW' },
            { path: `/${rootId}/programs`, label: 'PROGRAMS' },
            { path: `/${rootId}/sessions`, label: 'SESSIONS' },
            { path: `/${rootId}/analytics`, label: 'ANALYTICS' }
        ];

        return (
            <div className="top-nav-links">
                <div className="nav-group">
                    <span className="fractal-title">{fractalName}</span>
                    <div className="nav-separator">|</div>
                    <button
                        className="nav-text-link add-session-btn"
                        onClick={() => navigate(`/${rootId}/create-session`)}
                        style={{
                            background: '#4caf50',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            fontWeight: 'bold'
                        }}
                    >
                        + ADD SESSION
                    </button>
                    <div className="nav-separator">|</div>
                    {navItems.map(item => (
                        <button
                            key={item.path}
                            className={`nav-text-link ${location.pathname === item.path ? 'active' : ''}`}
                            onClick={() => navigate(item.path)}
                        >
                            {item.label}
                        </button>
                    ))}

                    {/* Render Page Specific Actions */}
                    {headerActions && (
                        <>
                            <div className="nav-separator">|</div>
                            {headerActions}
                        </>
                    )}

                    <div className="nav-separator">|</div>
                    <button className="nav-text-link home-link" onClick={() => navigate('/')}>
                        EXIT TO HOME
                    </button>
                </div>
            </div>
        );
    };

    return (
        <HeaderProvider>
            <div className="app-container">
                {location.pathname !== '/' && (
                    <NavigationHeader />
                )}

                <div className="content-container">
                    {location.pathname === '/' ? (
                        <Selection />
                    ) : (
                        <Routes>
                            <Route
                                path="/:rootId/fractal-goals"
                                element={<FractalGoals />}
                            />
                            <Route path="/:rootId/programs" element={<Programs />} />
                            <Route path="/:rootId/programs/:programId" element={<ProgramDetail />} />
                            <Route path="/:rootId/sessions" element={<Sessions />} />
                            <Route path="/:rootId/analytics" element={<Analytics />} />
                            <Route path="/:rootId/session/:sessionId" element={<SessionDetail />} />
                            <Route path="/:rootId/create-session" element={<CreateSession />} />
                            <Route path="/:rootId/manage-session-templates" element={<CreateSessionTemplate />} />
                            <Route path="/:rootId/manage-activities" element={<ManageActivities />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    )}
                </div>

                {/* Environment Indicator */}
                <div className={`env-indicator ${import.meta.env.VITE_ENV || 'development'}`}>
                    {import.meta.env.VITE_ENV || 'development'}
                </div>
            </div>
        </HeaderProvider>
    );
}

export default App;
