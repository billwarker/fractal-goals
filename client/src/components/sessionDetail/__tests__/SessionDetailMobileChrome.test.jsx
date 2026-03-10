import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import SessionDetailMobileChrome from '../SessionDetailMobileChrome';
import SessionDetailMobileDock from '../SessionDetailMobileDock';

describe('SessionDetail mobile shell', () => {
    it('renders the mobile header and opens the selected pane on demand', () => {
        const onOpenPane = vi.fn();

        render(
            <SessionDetailMobileChrome
                sessionName="Morning Session"
                isCompleted={false}
                totalDuration={125}
                selectedModeLabel="Goals"
                onOpenPane={onOpenPane}
            />
        );

        expect(screen.getByText('Morning Session')).toBeInTheDocument();
        expect(screen.getByText('In progress')).toBeInTheDocument();
        expect(screen.getByText('Duration 02:05')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Open Goals' }));
        expect(onOpenPane).toHaveBeenCalledTimes(1);
    });

    it('routes bottom dock mode changes through the shared mode handler', () => {
        const onModeSelect = vi.fn();

        render(
            <SessionDetailMobileDock
                sidePaneMode="details"
                onModeSelect={onModeSelect}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'History' }));

        expect(onModeSelect).toHaveBeenCalledWith('history');
    });
});
