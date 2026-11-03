import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hooks } = vi.hoisted(() => ({
    hooks: {
        updateAnalyticsView: vi.fn(), duplicateAnalyticsView: vi.fn(), pinAnalyticsView: vi.fn(), markAnalyticsViewOpened: vi.fn(),
    },
}));
vi.mock('../../../hooks/useDashboardQueries', () => ({ useAnalyticsViews: () => hooks }));
vi.mock('../SavedViewChart', () => ({ default: () => <div data-testid="preview-chart" /> }));
vi.mock('../AddViewToGoalsModal', () => ({ default: () => <div role="dialog" aria-label="Show on goals" /> }));
vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({ getGoalIcon: () => 'circle', getGoalColor: () => '#2255DD', getGoalSecondaryColor: () => '#112244' }),
}));

import AnalyticsViewsModal, { chartLabel, openedLabel, usageLabel } from '../AnalyticsViewsModal';

const views = [
    {
        id: 'v1', name: 'Bench trend', kind: 'view', pinned: true, updated_at: '2026-10-01T00:00:00Z', last_opened_at: null,
        visualization: { category: 'activities', id: 'metricTrends' }, layout: {},
        goals: [{ id: 'g1', name: 'Bench 225' }, { id: 'g2', name: 'Press 135' }, { id: 'g3', name: 'Dip 20' }],
    },
    { id: 'v2', name: 'Weekly sessions', kind: 'view', pinned: false, updated_at: '2026-09-01T00:00:00Z', visualization: { category: 'sessions', id: 'sessionTrends' }, layout: {}, goals: [] },
    { id: 'd1', name: 'Overview', kind: 'dashboard', pinned: false, updated_at: '2026-06-03T00:00:00Z', layout: {}, goals: [] },
];

function renderModal(props = {}) {
    const onSelectView = vi.fn();
    const onDeleteView = vi.fn();
    const onClose = vi.fn();
    render(
        <MemoryRouter initialEntries={['/root/analytics']}>
            <Routes>
                <Route path="/:rootId/analytics" element={(
                    <AnalyticsViewsModal views={views} onSelectView={onSelectView} onDeleteView={onDeleteView} onClose={onClose} {...props} />
                )} />
            </Routes>
        </MemoryRouter>,
    );
    return { onSelectView, onDeleteView, onClose };
}

// The row buttons that pick a preview (each row also has its own Open button).
const cards = () => within(screen.getByRole('list', { name: 'Saved analytics' })).getAllByRole('button').filter((button) => button.hasAttribute('aria-pressed'));

describe('AnalyticsViewsModal', () => {
    beforeEach(() => vi.clearAllMocks());

    it('shows each item’s chart and use, not its goals, previewing the first', () => {
        renderModal();
        expect(cards()).toHaveLength(3);
        expect(cards()[0]).toHaveTextContent('Activities · Metric Trends');
        expect(cards()[0]).toHaveTextContent(/Updated .* · Never opened/);
        expect(cards()[0]).not.toHaveTextContent('Bench 225');
        const preview = screen.getByRole('region', { name: 'Bench trend preview' });
        expect(within(preview).getByTestId('preview-chart')).toBeInTheDocument();
        expect(within(preview).getByRole('link', { name: 'Dip 20' })).toHaveAttribute('href', '/root/goals?goal=g3');
    });

    it('searches goal names and filters by kind, goals and pins', () => {
        renderModal();
        fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'press' } });
        expect(cards().map((card) => card.textContent)).toEqual([expect.stringContaining('Bench trend')]);
        fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Dashboards' }));
        expect(cards()).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'On goals' }));
        expect(cards()).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Pinned' }));
        expect(cards()[0]).toHaveTextContent('Bench trend');
    });

    it('opens with Enter (recording it) and acts from the preview', async () => {
        const { onSelectView, onClose } = renderModal();
        fireEvent.click(cards()[1]);
        const preview = screen.getByRole('region', { name: 'Weekly sessions preview' });
        fireEvent.click(within(preview).getByRole('button', { name: 'Pin' }));
        expect(hooks.pinAnalyticsView).toHaveBeenCalledWith('v2', true);
        await waitFor(() => expect(within(preview).getByRole('button', { name: 'Duplicate' })).toBeEnabled());
        fireEvent.click(within(preview).getByRole('button', { name: 'Duplicate' }));
        await waitFor(() => expect(within(preview).getByRole('button', { name: 'Duplicate' })).toBeEnabled());
        expect(hooks.duplicateAnalyticsView).toHaveBeenCalledWith('v2');
        fireEvent.keyDown(cards()[1], { key: 'Enter' });
        expect(hooks.markAnalyticsViewOpened).toHaveBeenCalledWith('v2');
        expect(onSelectView).toHaveBeenCalledWith('v2');
        expect(onClose).toHaveBeenCalled();
    });

    it('names the goals in the delete warning straight away', () => {
        const { onDeleteView } = renderModal();
        fireEvent.click(within(screen.getByRole('region', { name: 'Bench trend preview' })).getByRole('button', { name: 'Delete' }));
        expect(screen.getByText(/shown on 3 goals \(Bench 225, Press 135, Dip 20\)/)).toBeInTheDocument();
        const dialogs = screen.getAllByRole('dialog');
        fireEvent.click(within(dialogs[dialogs.length - 1]).getByRole('button', { name: 'Delete' }));
        expect(onDeleteView).toHaveBeenCalledWith('v1');
    });

    it('keeps a failed rename draft open and permits retry', async () => {
        hooks.updateAnalyticsView.mockRejectedValueOnce(new Error('Name taken'));
        renderModal();
        const preview = screen.getByRole('region', { name: 'Bench trend preview' });
        fireEvent.click(within(preview).getByRole('button', { name: 'Rename' }));
        fireEvent.change(within(preview).getByRole('textbox', { name: 'Name' }), { target: { value: 'Taken name' } });
        fireEvent.click(within(preview).getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(within(preview).getByRole('button', { name: 'Save' })).toBeEnabled());
        expect(within(preview).getByRole('textbox', { name: 'Name' })).toHaveValue('Taken name');
    });

    it('renames from the preview', async () => {
        renderModal();
        const preview = screen.getByRole('region', { name: 'Bench trend preview' });
        fireEvent.click(within(preview).getByRole('button', { name: 'Rename' }));
        fireEvent.change(within(preview).getByRole('textbox', { name: 'Name' }), { target: { value: 'Bench by week' } });
        fireEvent.click(within(preview).getByRole('button', { name: 'Save' }));
        expect(hooks.updateAnalyticsView).toHaveBeenCalledWith({ dashboardId: 'v1', name: 'Bench by week' });
        await waitFor(() => expect(within(preview).queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument());
    });
});

describe('saved analytics helpers', () => {
    it('labels charts and recency', () => {
        expect(chartLabel(views[1])).toBe('Sessions · Session Trends');
        expect(chartLabel(views[2])).toBe('Dashboard');
        const now = new Date('2026-11-01T12:00:00Z');
        expect(openedLabel({ last_opened_at: '2026-10-29T10:00:00Z' }, now)).toBe('Opened 3 days ago');
        expect(openedLabel({ last_opened_at: '2026-11-01T08:00:00Z' }, now)).toBe('Opened today');
        expect(openedLabel({ last_opened_at: '2026-06-03T12:00:00Z' }, now)).toBe('Opened Jun 3, 2026');
        expect(openedLabel({}, now)).toBe('Never opened');
        expect(usageLabel({ updated_at: '2026-06-03T12:00:00Z', last_opened_at: '2026-10-31T10:00:00Z', open_count: 12 }, now))
            .toBe('Updated Jun 3, 2026 · Opened yesterday · 12 opens');
        expect(usageLabel({ updated_at: '2026-06-03T12:00:00Z', open_count: 0 }, now)).toBe('Updated Jun 3, 2026 · Never opened');
    });

    it('opens a row in one click from its Open button', () => {
        const { onSelectView, onClose } = renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Open Weekly sessions' }));
        expect(hooks.markAnalyticsViewOpened).toHaveBeenCalledWith('v2');
        expect(onSelectView).toHaveBeenCalledWith('v2');
        expect(onClose).toHaveBeenCalled();
    });
});
