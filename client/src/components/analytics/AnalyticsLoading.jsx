import React from 'react';

import LoadingState from '../common/LoadingState';

export default function AnalyticsLoading() {
    return <LoadingState variant="page" skeleton="chart" label="Loading analytics…" />;
}
