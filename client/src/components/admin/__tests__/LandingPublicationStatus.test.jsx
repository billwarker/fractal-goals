import { render, screen } from '@testing-library/react';
import {
    LandingPublicationSummary,
    LandingPublicDataNotice,
} from '../LandingPublicationStatus';

describe('LandingPublicationStatus', () => {
    it('shows verified static delivery metadata and the public-data warning', () => {
        render(
            <>
                <LandingPublicationSummary
                    publishedAt="2026-07-15T12:00:00Z"
                    publishedCount={2}
                    delivery={{ status: 'delivered', compressed_snapshot_bytes: 10240 }}
                />
                <LandingPublicDataNotice />
            </>,
        );

        expect(screen.getByText('2 examples live')).toBeInTheDocument();
        expect(screen.getByText(/Delivery: static verified · 10.0 KB/)).toBeInTheDocument();
        expect(screen.getByText(/publicly downloadable/)).toBeInTheDocument();
    });

    it('makes database-only delivery visible', () => {
        render(<LandingPublicationSummary delivery={{ status: 'database_only' }} />);

        expect(screen.getByText('Delivery: API only')).toBeInTheDocument();
    });
});
