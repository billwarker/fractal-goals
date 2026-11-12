import React, { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';

import { ThemeProvider, useTheme } from '../ThemeContext';

const { mockAuth, updatePreferences } = vi.hoisted(() => ({
    mockAuth: { current: null },
    updatePreferences: vi.fn(),
}));

vi.mock('../AuthContext', () => ({
    useOptionalAuth: () => mockAuth.current,
}));

vi.mock('../../utils/api', () => ({
    authApi: { updatePreferences: (...args) => updatePreferences(...args) },
}));

let latest;
function Probe() {
    const theme = useTheme();
    useEffect(() => {
        latest = theme;
    });
    return <span data-testid="theme">{theme.resolvedTheme}</span>;
}

const renderProvider = () => render(<ThemeProvider><Probe /></ThemeProvider>);
const stored = () => JSON.parse(localStorage.getItem('theme-preference'));

function stubSystemScheme(prefersLight) {
    const listeners = new Set();
    const media = {
        matches: prefersLight,
        addEventListener: (_event, listener) => listeners.add(listener),
        removeEventListener: (_event, listener) => listeners.delete(listener),
    };
    vi.stubGlobal('matchMedia', () => media);
    return (nextPrefersLight) => {
        media.matches = nextPrefersLight;
        for (const listener of listeners) listener({ matches: nextPrefersLight });
    };
}

describe('ThemeProvider', () => {
    beforeEach(() => {
        localStorage.clear();
        mockAuth.current = null;
        updatePreferences.mockReset().mockResolvedValue({ data: null });
        stubSystemScheme(false);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('follows the system scheme by default, including live changes', () => {
        const setSystem = stubSystemScheme(true);
        renderProvider();
        expect(screen.getByTestId('theme')).toHaveTextContent('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        act(() => setSystem(false));
        expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    });

    it('migrates the legacy fixed theme key', () => {
        localStorage.setItem('theme', 'light');
        renderProvider();
        expect(latest.preference.mode).toBe('light');
        expect(stored()).toEqual({ mode: 'light', darkFrom: '20:00', lightFrom: '07:00' });
    });

    it('switches a schedule at its boundary and eases the change', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 10, 11, 19, 58));
        localStorage.setItem('theme-preference', JSON.stringify({ mode: 'schedule', darkFrom: '20:00', lightFrom: '07:00' }));
        renderProvider();
        expect(screen.getByTestId('theme')).toHaveTextContent('light');

        act(() => vi.advanceTimersByTime(3 * 60 * 1000));
        expect(screen.getByTestId('theme')).toHaveTextContent('dark');
        expect(document.documentElement.classList.contains('theme-transitioning')).toBe(true);
        act(() => vi.advanceTimersByTime(1000));
        expect(document.documentElement.classList.contains('theme-transitioning')).toBe(false);
    });

    it('re-resolves a schedule when the tab becomes visible again', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 10, 11, 12, 0));
        localStorage.setItem('theme-preference', JSON.stringify({ mode: 'schedule', darkFrom: '20:00', lightFrom: '07:00' }));
        renderProvider();
        expect(screen.getByTestId('theme')).toHaveTextContent('light');
        // A sleeping laptop wakes late in the evening without its timer having fired.
        vi.setSystemTime(new Date(2026, 10, 11, 23, 0));
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    });

    it('applies a user change immediately and saves it to the account', () => {
        mockAuth.current = { user: { id: 'user-1', preferences: {} }, setUser: vi.fn() };
        renderProvider();
        act(() => latest.setPreference({ mode: 'light' }));
        expect(screen.getByTestId('theme')).toHaveTextContent('light');
        expect(document.documentElement.classList.contains('theme-transitioning')).toBe(false);
        expect(updatePreferences).toHaveBeenCalledWith({
            preferences: { appearance: { mode: 'light', darkFrom: '20:00', lightFrom: '07:00' } },
        });
    });

    it('adopts the account preference on sign-in', () => {
        mockAuth.current = {
            user: { id: 'user-1', preferences: { appearance: { mode: 'dark', darkFrom: '20:00', lightFrom: '07:00' } } },
            setUser: vi.fn(),
        };
        stubSystemScheme(true);
        renderProvider();
        expect(screen.getByTestId('theme')).toHaveTextContent('dark');
        expect(updatePreferences).not.toHaveBeenCalled();
    });

    it('saves a device choice to an account that has none', () => {
        localStorage.setItem('theme-preference', JSON.stringify({ mode: 'schedule', darkFrom: '21:00', lightFrom: '06:30' }));
        mockAuth.current = { user: { id: 'user-1', preferences: {} }, setUser: vi.fn() };
        renderProvider();
        expect(updatePreferences).toHaveBeenCalledWith({
            preferences: { appearance: { mode: 'schedule', darkFrom: '21:00', lightFrom: '06:30' } },
        });
    });

    it('works signed out without calling the account API', () => {
        renderProvider();
        act(() => latest.setPreference({ mode: 'dark' }));
        expect(screen.getByTestId('theme')).toHaveTextContent('dark');
        expect(updatePreferences).not.toHaveBeenCalled();
    });

    it('keeps the live demo guest’s choice on the device', () => {
        localStorage.setItem('theme-preference', JSON.stringify({ mode: 'dark', darkFrom: '20:00', lightFrom: '07:00' }));
        mockAuth.current = { user: { id: 'demo', isDemo: true, preferences: {} }, setUser: vi.fn() };
        renderProvider();
        act(() => latest.setPreference({ mode: 'light' }));
        expect(screen.getByTestId('theme')).toHaveTextContent('light');
        expect(updatePreferences).not.toHaveBeenCalled();
    });
});
