import { render, screen } from '@testing-library/react';
import { LandingPublicationSummary } from '../LandingPublicationStatus';

describe('LandingPublicationStatus', () => {
    it('shows verified static delivery metadata', () => {
        render(
            <LandingPublicationSummary
                publishedAt="2026-07-15T12:00:00Z"
                publishedCount={2}
                delivery={{
                    status: 'delivered',
                    compressed_snapshot_bytes: 10240,
                    snapshot_bytes: 3145728,
                }}
            />,
        );

        expect(screen.getByText('2 demos live')).toBeInTheDocument();
        expect(screen.getByText(/Delivery: static verified · 10.0 KB transfer · 3.0 MB expanded/)).toBeInTheDocument();
    });

    it('makes database-only delivery visible', () => {
        render(<LandingPublicationSummary delivery={{ status: 'database_only' }} />);

        expect(screen.getByText('Delivery: API only')).toBeInTheDocument();
    });
});
