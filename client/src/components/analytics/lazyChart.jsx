import React, { lazy, Suspense } from 'react';
import { ChartLoading } from './ChartStates';

/** Keep chart implementations out of the registry's initial transfer, with a local loading state. */
export default function lazyChart(load) {
    const Chart = lazy(load);
    return function DeferredChart(props) {
        return <Suspense fallback={<ChartLoading label="Loading chart…" />}><Chart {...props} /></Suspense>;
    };
}
