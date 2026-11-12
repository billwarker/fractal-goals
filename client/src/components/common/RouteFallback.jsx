import React from 'react';

import LoadingState from './LoadingState';

/** Suspense fallback while a route's code loads. */
export default function RouteFallback({ label = 'Loading…' }) {
    return <LoadingState variant="page" label={label} />;
}
