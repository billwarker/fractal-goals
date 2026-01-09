/**
 * useAutoSave - Reusable debounced auto-save hook
 * 
 * Debounces changes and calls the save function after a delay.
 * Tracks status to show user feedback (saving, saved, error).
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * @param {any} data - Data to save (changes trigger debounce)
 * @param {Function} saveFn - Async function called with data to perform save
 * @param {Object} options - Configuration options
 * @param {number} options.delay - Debounce delay in ms (default: 1000)
 * @param {boolean} options.enabled - Whether auto-save is enabled (default: true)
 * @param {boolean} options.skipFirstRender - Skip save on initial render (default: true)
 */
export function useAutoSave(data, saveFn, options = {}) {
    const { delay = 1000, enabled = true, skipFirstRender = true } = options;

    // Status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
    const [status, setStatus] = useState('idle');
    const [lastError, setLastError] = useState(null);

    const timeoutRef = useRef(null);
    const isFirstRender = useRef(true);
    const lastDataRef = useRef(data);

    useEffect(() => {
        // Skip first render to avoid saving on load
        if (skipFirstRender && isFirstRender.current) {
            isFirstRender.current = false;
            lastDataRef.current = data;
            return;
        }

        // Skip if disabled
        if (!enabled) {
            return;
        }

        // Skip if data hasn't actually changed (shallow comparison)
        if (data === lastDataRef.current) {
            return;
        }
        lastDataRef.current = data;

        // Clear existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Set pending status immediately
        setStatus('pending');
        setLastError(null);

        // Debounce the save
        timeoutRef.current = setTimeout(async () => {
            setStatus('saving');

            try {
                await saveFn(data);
                setStatus('saved');

                // Reset to idle after showing "saved" briefly
                setTimeout(() => setStatus('idle'), 2000);
            } catch (err) {
                console.error('Auto-save failed:', err);
                setLastError(err.message || 'Save failed');
                setStatus('error');

                // Reset to idle after showing error
                setTimeout(() => setStatus('idle'), 3000);
            }
        }, delay);

        // Cleanup on unmount or when dependencies change
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [data, saveFn, delay, enabled, skipFirstRender]);

    /**
     * Force an immediate save (bypasses debounce)
     */
    const saveNow = useCallback(async () => {
        if (!enabled) return;

        // Clear any pending debounce
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        setStatus('saving');
        setLastError(null);

        try {
            await saveFn(lastDataRef.current);
            setStatus('saved');
            setTimeout(() => setStatus('idle'), 2000);
        } catch (err) {
            console.error('Immediate save failed:', err);
            setLastError(err.message || 'Save failed');
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        }
    }, [saveFn, enabled]);

    /**
     * Reset status to idle
     */
    const reset = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setStatus('idle');
        setLastError(null);
    }, []);

    /**
     * Check if there are pending changes
     */
    const hasPendingChanges = status === 'pending' || status === 'saving';

    return {
        status,
        lastError,
        saveNow,
        reset,
        hasPendingChanges
    };
}

export default useAutoSave;
