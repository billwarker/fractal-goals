import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { authApi } from '../utils/api';
import { readLocalStorageValue, writeLocalStorageValue } from '../utils/localPreferences';
import {
    DEFAULT_THEME_PREFERENCE,
    THEME_PREFERENCE_STORAGE_KEY,
    nextThemeSwitchAt,
    normalizeThemePreference,
    resolveTheme,
} from '../utils/themeSchedule';
import { useOptionalAuth } from './AuthContext';

const ThemeContext = createContext();

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

/** Theme context, or null outside a ThemeProvider (shared contexts above it in tests). */
export const useOptionalTheme = () => useContext(ThemeContext);

// Helper: Adjust brightness of a hex color (useful for hover states)
export function adjustBrightness(hex, percent) {
    hex = hex.replace('#', '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    r = Math.min(255, Math.max(0, r + (r * percent)));
    g = Math.min(255, Math.max(0, g + (g * percent)));
    b = Math.min(255, Math.max(0, b + (b * percent)));
    const rr = Math.round(r).toString(16).padStart(2, '0');
    const gg = Math.round(g).toString(16).padStart(2, '0');
    const bb = Math.round(b).toString(16).padStart(2, '0');
    return `#${rr}${gg}${bb}`;
}

const SCHEDULED_TRANSITION_MS = 700;
const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)';

const systemPrefersLight = () => Boolean(globalThis.matchMedia?.(LIGHT_SCHEME_QUERY).matches);

// The legacy 'theme' key held a fixed light/dark choice.
function readStoredPreference() {
    try {
        const stored = JSON.parse(readLocalStorageValue(THEME_PREFERENCE_STORAGE_KEY));
        if (stored && typeof stored === 'object') return normalizeThemePreference(stored);
    } catch {
        // Unreadable values fall through to the legacy key.
    }
    const legacy = readLocalStorageValue('theme');
    return normalizeThemePreference(legacy === 'light' || legacy === 'dark' ? { mode: legacy } : null);
}

const samePreference = (left, right) => (
    left.mode === right.mode && left.darkFrom === right.darkFrom && left.lightFrom === right.lightFrom
);

/**
 * Theme preference (system, light, dark, or a daily schedule) and the theme it resolves to.
 * The preference is kept per device in localStorage, which the boot shell reads before
 * first paint, and synced to the account (`user.preferences.appearance`) when signed in.
 */
export const ThemeProvider = ({ children }) => {
    const auth = useOptionalAuth();
    const user = auth?.user ?? null;
    const setUser = auth?.setUser;
    const [preference, setPreferenceState] = useState(readStoredPreference);
    const [prefersLight, setPrefersLight] = useState(systemPrefersLight);
    const [clock, setClock] = useState(() => new Date());
    const syncedUserId = useRef(null);
    const previousTheme = useRef(null);
    const userChangedTheme = useRef(false);

    const resolvedTheme = resolveTheme(preference, clock, prefersLight);

    // --- Animated Icons Preference ---
    const [animatedIcons, setAnimatedIcons] = useState(() => {
        const saved = readLocalStorageValue('animatedIcons');
        return saved !== null ? saved === 'true' : true; // default on
    });

    useEffect(() => {
        writeLocalStorageValue(THEME_PREFERENCE_STORAGE_KEY, JSON.stringify(preference));
    }, [preference]);

    useEffect(() => {
        const root = document.documentElement;
        // Only an automatic switch eases between themes; a click should feel immediate.
        const automatic = previousTheme.current !== null && previousTheme.current !== resolvedTheme && !userChangedTheme.current;
        previousTheme.current = resolvedTheme;
        userChangedTheme.current = false;
        root.setAttribute('data-theme', resolvedTheme);
        if (!automatic) return undefined;
        root.classList.add('theme-transitioning');
        const timer = setTimeout(() => root.classList.remove('theme-transitioning'), SCHEDULED_TRANSITION_MS);
        return () => {
            clearTimeout(timer);
            root.classList.remove('theme-transitioning');
        };
    }, [resolvedTheme]);

    // Always tracked, so switching to System mode never starts from a stale value.
    useEffect(() => {
        if (!globalThis.matchMedia) return undefined;
        const media = globalThis.matchMedia(LIGHT_SCHEME_QUERY);
        const handleChange = (event) => setPrefersLight(event.matches);
        media.addEventListener('change', handleChange);
        return () => media.removeEventListener('change', handleChange);
    }, []);

    // A schedule wakes at its next switch, and re-checks when the tab returns (timers
    // don't fire while a laptop sleeps).
    useEffect(() => {
        if (preference.mode !== 'schedule') return undefined;
        const nextSwitch = nextThemeSwitchAt(preference, new Date());
        const timer = nextSwitch
            ? setTimeout(() => setClock(new Date()), Math.max(0, nextSwitch.getTime() - Date.now()) + 1000)
            : null;
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') setClock(new Date());
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            if (timer) clearTimeout(timer);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [preference, clock]);

    // On sign-in the account's preference wins; an account without one adopts this device's choice.
    useEffect(() => {
        if (!user?.id || syncedUserId.current === user.id) return;
        syncedUserId.current = user.id;
        const accountValue = user.preferences?.appearance;
        if (accountValue) {
            const accountPreference = normalizeThemePreference(accountValue);
            // eslint-disable-next-line react-hooks/set-state-in-effect -- Sign-in delivers the account's saved choice.
            setPreferenceState((current) => (samePreference(current, accountPreference) ? current : accountPreference));
        } else if (!samePreference(preference, DEFAULT_THEME_PREFERENCE)) {
            authApi.updatePreferences({ preferences: { appearance: preference } }).catch(() => {});
        }
    }, [user, preference]);

    const userId = user?.id;
    const setPreference = useCallback((update) => {
        const next = normalizeThemePreference({ ...preference, ...update });
        if (samePreference(preference, next)) return;
        userChangedTheme.current = true;
        setPreferenceState(next);
        setClock(new Date());
        if (!userId) return;
        authApi.updatePreferences({ preferences: { appearance: next } })
            .then((response) => {
                if (setUser && response?.data?.id === userId) setUser(response.data);
            })
            .catch(() => {
                // The device keeps the choice; the account catches up on the next change.
            });
    }, [preference, userId, setUser]);

    useEffect(() => {
        writeLocalStorageValue('animatedIcons', String(animatedIcons));
    }, [animatedIcons]);

    const toggleAnimatedIcons = useCallback(() => {
        setAnimatedIcons(prev => !prev);
    }, []);

    const value = useMemo(() => ({
        theme: resolvedTheme,
        resolvedTheme,
        preference,
        setPreference,
        animatedIcons,
        toggleAnimatedIcons,
    }), [resolvedTheme, preference, setPreference, animatedIcons, toggleAnimatedIcons]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};
