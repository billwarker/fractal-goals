import React from 'react';

export default function AnalyticsEvidenceNotice({ hasMoreEvidence, loadingMoreEvidence, loadMoreEvidence }) {
    if (!hasMoreEvidence) return null;
    return <div role="status">
        {loadingMoreEvidence ? 'Loading full session and activity history… Charts will update as history loads.' : 'Some history is still missing.'}
        {!loadingMoreEvidence && <button type="button" onClick={() => loadMoreEvidence()}>
            Retry loading history
        </button>}
    </div>;
}
