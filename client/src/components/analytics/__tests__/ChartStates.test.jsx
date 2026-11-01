import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChartEmpty, ChartError, ChartLoading, ChartScopeProvider } from '../ChartStates';

describe('chart states', () => {
    it('says what would appear when there is nothing yet', () => {
        render(<ChartEmpty description="Trends appear once sessions have dates." />);
        expect(screen.getByText('Nothing to show yet')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    });

    it('points at the filters, and clears them, when filters are set', () => {
        const onClearFilters = vi.fn();
        render(
            <ChartScopeProvider hasActiveFilters onClearFilters={onClearFilters}>
                <ChartEmpty description="Trends appear once sessions have dates." />
            </ChartScopeProvider>,
        );
        expect(screen.getByText('Nothing matches these filters')).toBeInTheDocument();
        expect(screen.getByText(/Try a wider time range or fewer filters/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
        expect(onClearFilters).toHaveBeenCalled();
    });

    it('announces loading and offers a retry on errors', () => {
        const onRetry = vi.fn();
        render(<><ChartLoading label="Loading full history…" /><ChartError onRetry={onRetry} /></>);
        expect(screen.getByRole('status')).toHaveTextContent('Loading full history…');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalled();
    });
});
