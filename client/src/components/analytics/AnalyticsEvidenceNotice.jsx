import React from 'react';

export default function AnalyticsEvidenceNotice({ hasMoreEvidence, evidenceError, loadMoreEvidence }) {
    if (!hasMoreEvidence) return null;
    return <div role="status">
        {evidenceError ? 'Some history is still missing.' : 'Loading full session and activity history…'}
        {evidenceError && <button type="button" onClick={() => loadMoreEvidence()}>
            Retry loading history
        </button>}
    </div>;
}
