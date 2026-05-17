import React, { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { createChartOptions, DISABLED_CHART_ANIMATION, useChartOptions } from '../ChartJSWrapper';

describe('ChartJSWrapper', () => {
    it('disables Chart.js render animations for analytics charts', () => {
        const options = createChartOptions({
            title: 'Weight Over Time',
            xAxisLabel: 'Date',
            yAxisLabel: 'Weight',
            isTimeScale: true,
        });

        expect(options.animation).toBe(false);
        expect(options.animations).toEqual(DISABLED_CHART_ANIMATION.animations);
        expect(options.transitions.active.animation.duration).toBe(0);
        expect(options.transitions.show.animations.y.duration).toBe(0);
    });

    it('does not rebuild options when callers recreate identical layout padding objects', async () => {
        const optionUpdates = [];

        function OptionsProbe({ tick }) {
            const options = useChartOptions({
                title: 'Stable Chart',
                xAxisLabel: 'Date',
                yAxisLabel: 'Value',
                isTimeScale: true,
                layoutPadding: { top: 8, right: 16, bottom: 20, left: 8 },
            });

            useEffect(() => {
                optionUpdates.push(options);
            }, [options]);

            return <span>{tick}</span>;
        }

        const { rerender } = render(<OptionsProbe tick={0} />);

        await waitFor(() => {
            expect(optionUpdates.length).toBeGreaterThanOrEqual(2);
        });

        const updatesAfterMount = optionUpdates.length;

        rerender(<OptionsProbe tick={1} />);

        await act(async () => {
            await Promise.resolve();
        });

        expect(optionUpdates).toHaveLength(updatesAfterMount);
    });
});
