import React from 'react';

export default function AnalyticsEvidenceNotice({ hasMoreEvidence, loadingMoreEvidence, loadMoreEvidence }) {
    if (!hasMoreEvidence) return null;
    return <div role="status">
        Activity charts show the loaded evidence from the latest 50 sessions.
        <button type="button" disabled={loadingMoreEvidence} onClick={() => loadMoreEvidence()}>
            {loadingMoreEvidence ? 'Loading evidence…' : 'Load more activity evidence'}
        </button>
    </div>;
}
