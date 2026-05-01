/**
 * Vitest test setup file
 * Extends Jest matchers with @testing-library/jest-dom
 */

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
});
