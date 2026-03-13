import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ComponentErrorBoundary from '../ComponentErrorBoundary';
import { pageReloader } from '../../../utils/lazyWithRetry';

function ThrowError({ error }) {
    throw error;
}

describe('ComponentErrorBoundary', () => {
    let consoleErrorSpy;
    let reloadSpy;

    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        reloadSpy = vi.spyOn(pageReloader, 'reload').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        reloadSpy.mockRestore();
    });

    it('offers a page reload for dynamic import failures', () => {
        render(
            <ComponentErrorBoundary>
                <ThrowError error={new TypeError('Failed to fetch dynamically imported module: /assets/Analytics.js')} />
            </ComponentErrorBoundary>
        );

        fireEvent.click(screen.getByRole('button', { name: 'Reload Page' }));

        expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps the normal retry action for non-chunk errors', () => {
        render(
            <ComponentErrorBoundary>
                <ThrowError error={new Error('Unexpected render failure')} />
            </ComponentErrorBoundary>
        );

        expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
        expect(reloadSpy).not.toHaveBeenCalled();
    });
});
