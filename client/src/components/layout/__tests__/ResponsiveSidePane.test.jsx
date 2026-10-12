import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ResponsiveSidePane from '../ResponsiveSidePane';

const renderPane = (props) => render(
    <div data-testid="page">
        <ResponsiveSidePane panelClassName="panel" backdropClassName="backdrop" onClose={vi.fn()} {...props}>
            <p>Filters</p>
        </ResponsiveSidePane>
    </div>,
);

describe('ResponsiveSidePane', () => {
    it('renders nothing while closed', () => {
        renderPane({ open: false, isMobile: false });
        expect(screen.queryByText('Filters')).toBeNull();
    });

    it('renders inline on desktop without a backdrop', () => {
        const { container } = renderPane({ open: true, isMobile: false });
        expect(screen.getByTestId('page')).toContainElement(screen.getByText('Filters'));
        expect(container.ownerDocument.querySelector('.backdrop')).toBeNull();
    });

    it('portals a dismissible sheet on mobile', () => {
        const onClose = vi.fn();
        renderPane({ open: true, isMobile: true, onClose });
        expect(screen.getByTestId('page')).not.toContainElement(screen.getByText('Filters'));
        fireEvent.click(document.body.querySelector('.backdrop'));
        expect(onClose).toHaveBeenCalled();
    });
});
