import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { setTelemetryEnabled, trackPageView } from '../utils/telemetry';

/**
 * Enables telemetry while a user is authenticated and records one page_view
 * per route change. Mounted once in the app shell.
 */
export function usePageViewTelemetry() {
    const location = useLocation();
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        setTelemetryEnabled(isAuthenticated);
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;
        trackPageView(location.pathname);
    }, [isAuthenticated, location.pathname]);
}

export default usePageViewTelemetry;
