export const WHEEL_GESTURE_IDLE_MS = 180;

function getVerticalScrollStateWithin(target, boundary, deltaY) {
    let element = target instanceof Element ? target : null;
    let outermostScrollableElement = null;

    while (element && element !== boundary) {
        const style = window.getComputedStyle(element);
        const isScrollable = /(auto|scroll|overlay)/.test(style.overflowY)
            && element.scrollHeight > element.clientHeight;
        if (isScrollable) {
            outermostScrollableElement = element;
            const canScrollUp = element.scrollTop > 0;
            const canScrollDown = element.scrollTop + element.clientHeight < element.scrollHeight - 1;
            const canScrollInDirection = deltaY < 0 ? canScrollUp : canScrollDown;
            if (canScrollInDirection) return { element, canScrollInDirection: true };
        }
        element = element.parentElement;
    }

    return outermostScrollableElement
        ? { element: outermostScrollableElement, canScrollInDirection: false }
        : null;
}

export function resolveNestedWheelIntent({
    target,
    boundary,
    deltaX,
    deltaY,
    previousGesture,
    now,
}) {
    if (Math.abs(deltaY) <= Math.abs(deltaX)) {
        return { action: 'page', gesture: previousGesture };
    }

    const scrollState = getVerticalScrollStateWithin(target, boundary, deltaY);
    if (!scrollState) return { action: 'page', gesture: previousGesture };

    const direction = Math.sign(deltaY);
    const isSameGesture = previousGesture
        && previousGesture.element === scrollState.element
        && previousGesture.direction === direction
        && now - previousGesture.lastEventAt < WHEEL_GESTURE_IDLE_MS;
    const gesture = { element: scrollState.element, direction, lastEventAt: now };

    if (scrollState.canScrollInDirection) return { action: 'nested', gesture };
    return { action: isSameGesture ? 'hold' : 'page', gesture };
}
