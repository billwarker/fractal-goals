import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../hooks/useActivityTagCatalog', () => ({
    useActivityTagCatalog: () => ({ data: { families: [], tags: [] } }),
}));

import AnalyticsFiltersSidebar from '../AnalyticsFiltersSidebar';

describe('AnalyticsFiltersSidebar', () => {
    it('keeps custom date inputs visible after selecting the Custom preset', async () => {
        function Harness() {
            const [dateRange, setDateRange] = React.useState({ start: null, end: null });

            return (
                <AnalyticsFiltersSidebar
                    filters={{}}
                    dateRange={dateRange}
                    onDateRangeChange={setDateRange}
                />
            );
        }

        render(<Harness />);

        // Time range is an optional filter, shown once it's picked from the tray.
        fireEvent.click(screen.getByRole('button', { name: 'Time range' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Custom' }));

        expect(screen.getByLabelText('Start')).toBeInTheDocument();
        expect(screen.getByLabelText('End')).toBeInTheDocument();
    });
});
