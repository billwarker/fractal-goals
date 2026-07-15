import {
    dismissLandingBootShell,
    handoffLandingBootShell,
    LANDING_CSS_READY_PROPERTY,
} from '../landingBootHandoff';

describe('landing boot handoff', () => {
    beforeEach(() => {
        document.documentElement.removeAttribute('data-landing-react-ready');
        document.body.innerHTML = `
            <main id="landing-boot-shell"></main>
            <div id="root"><main data-landing-ready-surface></main></div>
        `;
    });

    it('keeps the shell covering React until the Landing stylesheet is active', () => {
        const frames = [];
        let cssReady = false;
        const requestFrame = vi.fn((callback) => {
            frames.push(callback);
            return frames.length;
        });
        const cancelFrame = vi.fn();
        const cleanup = handoffLandingBootShell({
            documentRef: document,
            getComputedStyleRef: () => ({
                getPropertyValue: (property) => (
                    property === LANDING_CSS_READY_PROPERTY && cssReady ? '1' : ''
                ),
            }),
            requestAnimationFrameRef: requestFrame,
            cancelAnimationFrameRef: cancelFrame,
        });

        frames.shift()();
        expect(document.getElementById('landing-boot-shell')).toBeInTheDocument();

        cssReady = true;
        frames.shift()();
        expect(document.getElementById('landing-boot-shell')).not.toBeInTheDocument();
        expect(document.documentElement).toHaveAttribute('data-landing-react-ready', 'true');

        cleanup();
        expect(cancelFrame).not.toHaveBeenCalled();
    });

    it('can dismiss the cover immediately for bootstrap and render errors', () => {
        dismissLandingBootShell(document);
        expect(document.getElementById('landing-boot-shell')).not.toBeInTheDocument();
    });
});
