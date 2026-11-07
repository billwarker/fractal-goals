import { render } from '@testing-library/react';
import { useRef } from 'react';

import useAnchoredPortalPosition from '../useAnchoredPortalPosition';

function PositionedOverlay(props) {
    const anchorRef = useRef(null);
    const overlayRef = useRef(null);

    useAnchoredPortalPosition({
        open: true,
        anchorRef,
        overlayRef,
        maxWidth: 280,
        estimatedHeight: 190,
        ...props,
    });

    return (
        <>
            <button ref={anchorRef} type="button">Open</button>
            <div ref={overlayRef} data-testid="overlay">Menu</div>
        </>
    );
}

describe('useAnchoredPortalPosition', () => {
    const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');

    afterEach(() => {
        if (originalVisualViewport) {
            Object.defineProperty(window, 'visualViewport', originalVisualViewport);
        } else {
            delete window.visualViewport;
        }
        vi.restoreAllMocks();
    });

    describe('fitContent', () => {
        const box = (left, width) => ({ left, right: left + width, width, top: 100, bottom: 112, height: 12 });
        const open = (overlayWidth, props = {}) => {
            vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measure() {
                return this.tagName === 'BUTTON' ? box(400, 12) : box(0, overlayWidth);
            });
            const { getByTestId } = render(<PositionedOverlay fitContent align="center" {...props} />);
            return getByTestId('overlay');
        };

        it('sizes to the content and centers on the anchor', () => {
            const overlay = open(100);
            expect(overlay.style.width).toBe('100px');
            expect(overlay.style.minWidth).toBe('100px');
            expect(overlay.style.left).toBe('356px');
        });

        it('stops growing at maxWidth', () => {
            expect(open(500).style.width).toBe('280px');
        });
    });

    it('clamps an overlay within an offset mobile visual viewport', () => {
        Object.defineProperty(window, 'visualViewport', {
            configurable: true,
            value: {
                width: 320,
                height: 480,
                offsetLeft: 20,
                offsetTop: 30,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            },
        });
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 10,
            right: 38,
            top: 40,
            bottom: 68,
            width: 28,
            height: 28,
            x: 10,
            y: 40,
            toJSON: () => ({}),
        });

        const { getByTestId } = render(<PositionedOverlay />);

        expect(getByTestId('overlay')).toHaveStyle({
            position: 'fixed',
            left: '28px',
            top: '74px',
            width: '280px',
            minWidth: '280px',
            maxHeight: '464px',
            overflowY: 'auto',
        });
    });
});
