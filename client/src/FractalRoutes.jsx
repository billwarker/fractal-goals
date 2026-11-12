import React, { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import ComponentErrorBoundary from './components/ui/ComponentErrorBoundary';
import LoadingState from './components/common/LoadingState';
import RouteFallback from './components/common/RouteFallback';
import { useAuth } from './contexts/AuthContext';
import { lazyWithRetry } from './utils/lazyWithRetry';

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

export function RequireAdmin({ children }) {
    const { user, loading } = useAuth();
    const { rootId } = useParams();

    // A reload or deep link renders before the current user resolves; redirecting then
    // would send admins away from admin-only pages.
    if (loading) return <LoadingState variant="page" label="Loading…" />;
    if (!user?.is_admin) {
        return <Navigate to={rootId ? `/${rootId}/goals` : '/'} replace />;
    }

    return children;
}

const page = (element) => (
    <ComponentErrorBoundary>
        <Suspense fallback={<RouteFallback />}>{element}</Suspense>
    </ComponentErrorBoundary>
);

// The pages inside one fractal, shared by the app and the live demo (src/demo/DemoRoot.jsx),
// so the demo is always the real thing. `fallbackPath` is where unknown paths go.
export default function FractalRoutes({ fallbackPath = '/' }) {
    const location = useLocation();
    return (
        <Routes key={location.pathname}>
            <Route path="/:rootId/goals" element={page(<FractalGoals />)} />
            <Route path="/:rootId/programs" element={page(<ProgramCalendarPage />)} />
            <Route path="/:rootId/programs/:programId" element={page(<ProgramCalendarPage />)} />
            <Route path="/:rootId/programs/:programId/blocks" element={page(<ProgramCalendarPage />)} />
            <Route path="/:rootId/sessions" element={page(<Sessions />)} />
            <Route path="/:rootId/analytics" element={page(<Analytics />)} />
            <Route path="/:rootId/notes" element={page(<Notes />)} />
            <Route path="/:rootId/logs" element={<RequireAdmin>{page(<Logs />)}</RequireAdmin>} />
            <Route path="/:rootId/session/:sessionId" element={page(<SessionDetail />)} />
            <Route path="/:rootId/create-session" element={page(<CreateSession />)} />
            <Route path="/:rootId/manage-session-templates" element={page(<CreateSessionTemplate />)} />
            <Route path="/:rootId/manage-activities" element={page(<ManageActivities />)} />
            <Route path="*" element={<Navigate to={fallbackPath} replace />} />
        </Routes>
    );
}
