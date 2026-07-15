export default function createLandingIntersectionObserverStub(observers, act) {
    return class IntersectionObserverStub {
        constructor(callback, options) {
            this.callback = callback;
            this.options = options;
            observers.push(this);
        }

        observe(element) {
            if (this.options.threshold === 0.01) {
                queueMicrotask(() => act(() => {
                    this.callback([{ target: element, isIntersecting: true }]);
                }));
            }
        }

        unobserve() {}
        disconnect() {}
    };
}
