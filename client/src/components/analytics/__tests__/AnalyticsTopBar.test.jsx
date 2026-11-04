import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../hooks/useActivityTagCatalog', () => ({
    useActivityTagCatalog: () => ({ data: { families: [], tags: [] } }),
}));

import AnalyticsFiltersSidebar from '../AnalyticsFiltersSidebar';
import AnalyticsTopBar from '../AnalyticsTopBar';

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

describe('AnalyticsTopBar Close', () => {
    it('is only offered on a saved item', () => {
        render(<AnalyticsTopBar />);
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

    it('closes straight away with nothing unsaved', () => {
        const onCloseView = vi.fn();
        render(<AnalyticsTopBar isSavedItemOpen onCloseView={onCloseView} />);
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onCloseView).toHaveBeenCalledTimes(1);
    });

    it('asks first when there are unsaved changes', () => {
        const onCloseView = vi.fn();
        render(<AnalyticsTopBar isSavedItemOpen hasUnsavedChanges onCloseView={onCloseView} />);
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onCloseView).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Discard and close' }));
        expect(onCloseView).toHaveBeenCalledTimes(1);
    });
});
