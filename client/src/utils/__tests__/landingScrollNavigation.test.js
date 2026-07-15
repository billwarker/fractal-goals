import { afterEach, describe, expect, it } from 'vitest';
import { resolveNestedWheelIntent } from '../landingScrollNavigation';

function createScrollRegion(parent, { scrollTop, clientHeight = 100, scrollHeight = 400 }) {
    const element = document.createElement('div');
    element.style.overflowY = 'auto';
    Object.defineProperties(element, {
        clientHeight: { configurable: true, value: clientHeight },
        scrollHeight: { configurable: true, value: scrollHeight },
        scrollTop: { configurable: true, writable: true, value: scrollTop },
    });
    parent.appendChild(element);
    return element;
}

function resolve(target, boundary, previousGesture, { deltaY, now }) {
    return resolveNestedWheelIntent({
        target,
        boundary,
        deltaX: 0,
        deltaY,
        previousGesture,
        now,
    });
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('resolveNestedWheelIntent', () => {
    it('holds bottom-boundary momentum and permits a fresh gesture after 180ms', () => {
        const boundary = document.body.appendChild(document.createElement('main'));
        const scroller = createScrollRegion(boundary, { scrollTop: 240 });

        const scrolling = resolve(scroller, boundary, null, { deltaY: 80, now: 1_000 });
        expect(scrolling.action).toBe('nested');

        scroller.scrollTop = 300;
        const momentum = resolve(scroller, boundary, scrolling.gesture, { deltaY: 70, now: 1_100 });
        expect(momentum.action).toBe('hold');

        const freshGesture = resolve(scroller, boundary, momentum.gesture, { deltaY: 70, now: 1_280 });
        expect(freshGesture.action).toBe('page');
    });

    it('applies the same boundary guard while scrolling upward', () => {
        const boundary = document.body.appendChild(document.createElement('main'));
        const scroller = createScrollRegion(boundary, { scrollTop: 40 });

        const scrolling = resolve(scroller, boundary, null, { deltaY: -60, now: 2_000 });
        scroller.scrollTop = 0;
        const momentum = resolve(scroller, boundary, scrolling.gesture, { deltaY: -60, now: 2_050 });
        expect(momentum.action).toBe('hold');

        const freshGesture = resolve(scroller, boundary, momentum.gesture, { deltaY: -60, now: 2_230 });
        expect(freshGesture.action).toBe('page');
    });

    it('allows scroll chaining and tracks separate nested regions independently', () => {
        const boundary = document.body.appendChild(document.createElement('main'));
        const sibling = createScrollRegion(boundary, { scrollTop: 180 });
        const outer = createScrollRegion(boundary, { scrollTop: 140 });
        const inner = createScrollRegion(outer, { scrollTop: 300 });

        const siblingGesture = resolve(sibling, boundary, null, { deltaY: 60, now: 3_000 });
        const chainedGesture = resolve(inner, boundary, siblingGesture.gesture, { deltaY: 60, now: 3_050 });
        expect(chainedGesture.action).toBe('nested');
        expect(chainedGesture.gesture.element).toBe(outer);

        outer.scrollTop = 300;
        const momentum = resolve(inner, boundary, chainedGesture.gesture, { deltaY: 60, now: 3_100 });
        expect(momentum.action).toBe('hold');
    });

    it('leaves ordinary and horizontal wheel events to page navigation', () => {
        const boundary = document.body.appendChild(document.createElement('main'));
        const target = boundary.appendChild(document.createElement('div'));
        expect(resolveNestedWheelIntent({
            target,
            boundary,
            deltaX: 0,
            deltaY: 60,
            previousGesture: null,
            now: 4_000,
        }).action).toBe('page');
        expect(resolveNestedWheelIntent({
            target,
            boundary,
            deltaX: 80,
            deltaY: 20,
            previousGesture: null,
            now: 4_000,
        }).action).toBe('page');
    });
});
