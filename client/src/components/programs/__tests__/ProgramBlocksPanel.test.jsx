import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';

import { renderWithProviders } from '../../../test/test-utils';
import { buildBlockCards } from '../../../utils/programBlocksViewModel';
import ProgramBlocksPanel from '../ProgramBlocksPanel';

const block = {
    id: 'block-1', name: 'Base', start_date: '2026-03-02', end_date: '2026-03-15', color: '#3A86FF',
};

const metrics = {
    blocks: [{
        block_id: 'block-1',
        consistency: { met_days: 3, scheduled_days_observed: 4, rate: 0.75 },
        status_counts: { complete: 3, missed: 1, rest: 0, pending: 2, scheduled: 6 },
        longest_streak: 2,
        goals: { due: 3, completed: 1 },
    }],
};

function renderPanel({ readOnly = false } = {}) {
    const handlers = {
        onEditBlock: vi.fn(),
        onDeleteBlock: vi.fn(),
    };
    renderWithProviders(
        <ProgramBlocksPanel
            cards={buildBlockCards({ blocks: [block], metrics, today: '2026-03-04' })}
            readOnly={readOnly}
            {...handlers}
        />,
        { withTimezone: false },
    );
    return handlers;
}

function metricValue(card, label) {
    return within(card).getByText(label).closest('div').querySelector('dd');
}

describe('ProgramBlocksPanel', () => {
    it('summarizes each block with status counts, consistency, goals, and streak', () => {
        renderPanel();

        const card = screen.getByRole('article', { name: 'Base' });
        expect(within(card).getByText('Active')).toBeInTheDocument();
        expect(within(card).getByText(/Week 1 of 2/)).toBeInTheDocument();
        const statuses = within(card).getByRole('list', { name: 'Base program days by status' });
        expect(within(statuses).getAllByRole('img').map((mark) => mark.getAttribute('aria-label'))).toEqual([
            '3 completed', '1 missed', '0 rest', '6 scheduled in total',
        ]);
        expect(metricValue(card, 'Consistency')).toHaveTextContent('75%3/4');
        expect(metricValue(card, 'Goals completed/due')).toHaveTextContent('1/3');
        expect(metricValue(card, 'Longest streak')).toHaveTextContent('2 days');
        expect(within(card).queryByText(/Alignment/)).not.toBeInTheDocument();
        expect(within(card).queryByText(/focus/i)).not.toBeInTheDocument();
    });

    it('edits and deletes from the block summary, leaving program days to the Days tab', async () => {
        const handlers = renderPanel();

        expect(screen.queryByText('Program days')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Edit Base' }));
        expect(handlers.onEditBlock).toHaveBeenCalledWith(expect.objectContaining({ id: 'block-1' }));

        fireEvent.click(screen.getByRole('button', { name: 'Delete Base' }));
        expect(handlers.onDeleteBlock).not.toHaveBeenCalled();
        expect(await screen.findByRole('heading', { name: 'Delete Block' })).toBeInTheDocument();
    });

    it('renders read-only without editing controls', () => {
        renderPanel({ readOnly: true });

        expect(screen.queryByRole('button', { name: 'Delete Base' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Edit Base' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Collapse Base' })).toBeInTheDocument();
    });

    it('collapses completed and upcoming blocks to their name and dates, and toggles them', () => {
        const blocks = [
            { ...block, id: 'past', name: 'Past', start_date: '2026-02-01', end_date: '2026-02-28' },
            { ...block, id: 'now', name: 'Now', start_date: '2026-03-01', end_date: '2026-03-31' },
            { ...block, id: 'next', name: 'Next', start_date: '2026-04-01', end_date: '2026-04-30' },
        ];
        renderWithProviders(
            <ProgramBlocksPanel cards={buildBlockCards({ blocks, metrics: { blocks: [] }, today: '2026-03-04' })} />,
            { withTimezone: false },
        );

        const statsOf = (name) => document.getElementById(`side-block-stats-${name.toLowerCase()}`);
        expect(statsOf('Now')).toBeVisible();
        expect(statsOf('Past')).not.toBeVisible();
        expect(statsOf('Next')).not.toBeVisible();
        expect(within(screen.getByRole('article', { name: 'Past' })).getByText(/Feb 1 – Feb 28/)).toBeVisible();

        const expand = screen.getByRole('button', { name: 'Expand Past' });
        expect(expand).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(expand);
        expect(statsOf('Past')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Collapse Past' }));
        expect(statsOf('Past')).not.toBeVisible();
    });
});
