import { act, renderHook } from '@testing-library/react';
import useDeferredSection from '../useDeferredSection';

describe('useDeferredSection', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('waits for the target to approach its scroll root and then disconnects', () => {
        const disconnect = vi.fn();
        let callback;
        let options;
        const observe = vi.fn();
        vi.stubGlobal('IntersectionObserver', class IntersectionObserverMock {
            constructor(nextCallback, nextOptions) {
                callback = nextCallback;
                options = nextOptions;
            }
            observe = observe;
            disconnect = disconnect;
        });
        const target = document.createElement('section');
        const root = document.createElement('main');
        const targetRef = { current: target };
        const rootRef = { current: root };

        const { result } = renderHook(() => (
            useDeferredSection(targetRef, rootRef, '0px 100%')
        ));

        expect(result.current).toBe(false);
        expect(observe).toHaveBeenCalledWith(target);
        expect(options).toEqual({ root, rootMargin: '0px 100%', threshold: 0.01 });

        act(() => callback([{ target, isIntersecting: true }]));

        expect(result.current).toBe(true);
        expect(disconnect).toHaveBeenCalled();
    });

    it('renders eagerly when IntersectionObserver is unavailable', () => {
        vi.stubGlobal('IntersectionObserver', undefined);
        const { result } = renderHook(() => useDeferredSection(
            { current: document.createElement('section') },
            { current: document.createElement('main') },
        ));

        expect(result.current).toBe(true);
    });
});
