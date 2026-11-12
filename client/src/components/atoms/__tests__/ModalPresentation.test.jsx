import React from 'react';
import { render, screen } from '@testing-library/react';

import Modal from '../Modal';

const { viewport } = vi.hoisted(() => ({ viewport: { mobile: false } }));
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => viewport.mobile }));

const renderModal = (props = {}) => render(
    <Modal isOpen onClose={vi.fn()} title="Edit goal" {...props}><p>Body</p></Modal>,
);
const container = () => screen.getByText('Body').closest('[tabindex="-1"]');

describe('Modal presentation', () => {
    it('is a centred card without a drag handle on desktop', () => {
        viewport.mobile = false;
        renderModal();
        expect(container().className).not.toMatch(/sheet/);
        expect(document.querySelector('[class*="handle"]')).toBeNull();
    });

    it('stays a centred modal on phones by default', () => {
        viewport.mobile = true;
        renderModal();
        expect(container()).not.toHaveClass('mobile-sheet-enter');
        expect(document.querySelector('[class*="handle"]')).toBeNull();
    });

    it('docks as a bottom sheet or fills the screen on phones when asked', () => {
        viewport.mobile = true;
        const { unmount } = renderModal({ mobilePresentation: 'sheet' });
        expect(container()).toHaveClass('mobile-sheet-enter');
        expect(document.querySelector('[class*="handle"]')).not.toBeNull();
        unmount();
        renderModal({ mobilePresentation: 'fullscreen' });
        expect(container().className).toMatch(/fullscreen/);
        expect(document.querySelector('[class*="handle"]')).toBeNull();
    });
});
