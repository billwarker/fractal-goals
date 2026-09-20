/**
 * Vitest test setup file
 * Extends Jest matchers with @testing-library/jest-dom
 */

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Node 25 can expose an incomplete Web Storage object when its localstorage-file
// option is unset. Keep jsdom tests on the standard Storage contract.
let localStorage;
try {
    localStorage = window.localStorage;
} catch {
    localStorage = null;
}

if (typeof localStorage?.clear !== 'function') {
    const values = new Map();
    localStorage = {
        get length() { return values.size; },
        clear() { values.clear(); },
        getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
        key(index) { return [...values.keys()][index] ?? null; },
        removeItem(key) { values.delete(String(key)); },
        setItem(key, value) { values.set(String(key), String(value)); },
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorage });
}

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
});
