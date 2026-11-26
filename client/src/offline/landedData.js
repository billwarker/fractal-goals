/**
 * A query-cache event that brings in data this device didn't write: the server's answer, or the
 * stored copy, which can be restored after the queue has loaded and been applied.
 */
export function isLandedData(event) {
    if (event?.type === 'added') return event.query.state.data !== undefined;
    if (event?.type !== 'updated') return false;
    return event.action?.type === 'setState' || (event.action?.type === 'success' && !event.action.manual);
}
