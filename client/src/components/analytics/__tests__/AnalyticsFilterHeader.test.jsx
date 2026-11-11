import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AnalyticsFilterHeader from '../AnalyticsFilterHeader';

describe('AnalyticsFilterHeader', () => {
    it('shows the filter mark only while the filter is applied', () => {
        const { rerender } = render(<AnalyticsFilterHeader title="Goals" summary="All goals" active={false} onClear={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'View goals filter selections' })).not.toBeInTheDocument();

        rerender(<AnalyticsFilterHeader title="Goals" summary="2 selected: Handstand, Planche" active onClear={vi.fn()} />);
        fireEvent.focus(screen.getByRole('button', { name: 'View goals filter selections' }));
        expect(screen.getByRole('tooltip')).toHaveTextContent('2 selected: Handstand, Planche');
    });
});
