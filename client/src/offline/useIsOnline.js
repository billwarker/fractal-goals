import { useSyncExternalStore } from 'react';

import { isOnline, subscribeConnectivity } from './connectivity';

/** Live API reachability (not just the radio), for UI that needs a connection. */
export function useIsOnline() {
    return useSyncExternalStore(subscribeConnectivity, isOnline, () => true);
}
