import React from 'react';
import { render, screen } from '@testing-library/react';

import SessionDetailPaneLayout from '../SessionDetailPaneLayout';

vi.mock('../SessionSidePane', () => ({
    default: () => <div>Session pane content</div>,
}));

describe('SessionDetailPaneLayout', () => {
    it('uses the shared mobile sheet entrance motion when opened', () => {
        render(
            <SessionDetailPaneLayout
                isMobile
                isMobilePaneOpen
                onCloseMobilePane={vi.fn()}
                selectedModeLabel="Details"
                sidePaneModel={{}}
            />
        );

        const overlay = screen.getByRole('presentation');
        const sheet = overlay.firstElementChild;
        expect(sheet).toHaveClass('mobile-sheet-enter');
        expect(overlay).toHaveClass('mobile-sheet-backdrop-enter');
    });
});
