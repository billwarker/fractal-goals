import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as renderBase, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GoalSmartSection from '../GoalSmartSection';

const mocks = vi.hoisted(() => ({ goalAttachments: vi.fn() }));
vi.mock('../../../utils/api/storageApi', () => ({
    storageApi: mocks,
    mediaContentUrl: (rootId, assetId) => `/api/${rootId}/media/${assetId}/content`,
    mediaOpenUrl: (rootId, assetId) => `/api/${rootId}/media/${assetId}/open`,
}));

const render = (ui) => renderBase(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>,
);

const review = { status: 'due', next_review_on: '2020-01-12', cadence: { value: 3, unit: 'months', source: 'level' } };
const goal = { id: 'g', name: 'Play in a band', review, attributes: { parent_id: 'p', description: 'Gig with friends' } };
const photo = { id: 'asset', name: 'Andry Form Reference.png', mime_type: 'image/png', provider: 'google_drive', available: true, alt_text: '' };

beforeEach(() => {
    vi.clearAllMocks();
    mocks.goalAttachments.mockResolvedValue({ data: [photo] });
});

describe('GoalSmartSection', () => {
    it('shows the description without a review line (the banner says when one is due)', () => {
        render(<GoalSmartSection goal={goal} />);

        expect(screen.getByText('Description')).toBeInTheDocument();
        expect(screen.getByText('Gig with friends')).toBeInTheDocument();
        expect(screen.queryByText(/Review every/)).toBeNull();
        expect(mocks.goalAttachments).not.toHaveBeenCalled();  // Media is only fetched when asked for.
    });

    it('says when there is no description', () => {
        render(<GoalSmartSection goal={{ id: 'g', attributes: {} }} />);
        expect(screen.getByText('No description')).toBeInTheDocument();
    });

    it('shows pictures and video attached to the description in view mode', async () => {
        render(<GoalSmartSection goal={goal} rootId="root" goalId="g" showMedia />);
        expect(await screen.findByRole('img', { name: 'Andry Form Reference.png' })).toHaveAttribute('src', '/api/root/media/asset/content');
        expect(screen.getByRole('link', { name: /Andry Form Reference\.png · Google Drive/ })).toBeInTheDocument();
        expect(mocks.goalAttachments).toHaveBeenCalledWith('root', 'g');
    });

    it('does not say "No description" when the description is only media', async () => {
        render(<GoalSmartSection goal={{ id: 'g', attributes: {} }} rootId="root" goalId="g" showMedia />);
        await screen.findByRole('img', { name: 'Andry Form Reference.png' });
        expect(screen.queryByText('No description')).not.toBeInTheDocument();
    });
});
