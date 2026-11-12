import { useEffect, useState } from 'react';

import { useServerSlow } from '../offline/serverWarmth';

export const LOADING_DELAY_MS = 200;
export const STILL_LOADING_MS = 4000;

/**
 * How far a loading state has escalated since it mounted:
 * 'hidden' (under `delayMs`, so fast loads never flash), 'loading', then 'slow' after
 * `slowMs`. `serverSlow` says whether API reads are waiting on the server (a cold start or
 * a slow network), so slow copy can say why.
 */
export default function useLoadEscalation({ delayMs = LOADING_DELAY_MS, slowMs = STILL_LOADING_MS } = {}) {
    const [stage, setStage] = useState(delayMs > 0 ? 'hidden' : 'loading');
    const serverSlow = useServerSlow();

    useEffect(() => {
        const timers = [];
        if (delayMs > 0) timers.push(setTimeout(() => setStage((current) => (current === 'hidden' ? 'loading' : current)), delayMs));
        timers.push(setTimeout(() => setStage('slow'), Math.max(slowMs, delayMs)));
        return () => timers.forEach(clearTimeout);
    }, [delayMs, slowMs]);

    return { stage, serverSlow };
}
