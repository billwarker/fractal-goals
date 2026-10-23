import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../hooks/useActivityTagCatalog', () => ({
    useActivityTagCatalog: () => ({ data: { families: [], tags: [] } }),
}));

import AnalyticsFiltersSidebar from '../AnalyticsFiltersSidebar';

describe('AnalyticsFiltersSidebar', () => {
    it('keeps custom date inputs visible after selecting the Custom preset', () => {
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

        fireEvent.click(screen.getByRole('button', { name: 'Custom' }));

        expect(screen.getByLabelText('Start')).toBeInTheDocument();
        expect(screen.getByLabelText('End')).toBeInTheDocument();
    });
});
