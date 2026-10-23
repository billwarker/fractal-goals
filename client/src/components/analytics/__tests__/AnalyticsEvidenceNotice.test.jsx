import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import AnalyticsEvidenceNotice from '../AnalyticsEvidenceNotice';

it('shows steady loading status between history requests and a retry action only after failure', () => {
    const loadMoreEvidence = vi.fn();
    const { rerender } = render(<AnalyticsEvidenceNotice hasMoreEvidence loadMoreEvidence={loadMoreEvidence} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading full session and activity history…');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<AnalyticsEvidenceNotice hasMoreEvidence evidenceError={new Error('offline')} loadMoreEvidence={loadMoreEvidence} />);
    expect(screen.getByRole('status')).toHaveTextContent('Some history is still missing.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading history' }));
    expect(loadMoreEvidence).toHaveBeenCalledTimes(1);

    rerender(<AnalyticsEvidenceNotice hasMoreEvidence={false} loadMoreEvidence={loadMoreEvidence} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
