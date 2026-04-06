import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import AnalyticsTopBar from '../AnalyticsTopBar';

describe('AnalyticsTopBar', () => {
    it('keeps custom date inputs visible after selecting the Custom preset', () => {
        function Harness() {
            const [dateRange, setDateRange] = React.useState({ start: null, end: null });

            return (
                <AnalyticsTopBar
                    currentViewName="Empty View"
                    onOpenViewsModal={() => {}}
                    onSaveView={() => {}}
                    dateRange={dateRange}
                    onDateRangeChange={setDateRange}
                />
            );
        }

        render(<Harness />);

        fireEvent.click(screen.getByRole('button', { name: 'Custom' }));

        expect(screen.getByLabelText('Start')).toBeInTheDocument();
        expect(screen.getByLabelText('End')).toBeInTheDocument();
    });
});
