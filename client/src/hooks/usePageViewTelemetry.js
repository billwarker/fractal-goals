import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { setTelemetryEnabled, trackPageView } from '../utils/telemetry';

/** Settings → General → Privacy: absent means on (the server enforces it too). */
export const usageAnalyticsAllowed = (user) => user?.preferences?.usage_analytics !== false;

/**
 * Enables telemetry while a user is authenticated and allows it, and records one
 * page_view per route change. Mounted once in the app shell.
 */
export function usePageViewTelemetry() {
    const location = useLocation();
    const { isAuthenticated, user } = useAuth();
    const enabled = isAuthenticated && usageAnalyticsAllowed(user);

    useEffect(() => {
        setTelemetryEnabled(enabled);
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;
        trackPageView(location.pathname);
    }, [enabled, location.pathname]);
}

export default usePageViewTelemetry;
