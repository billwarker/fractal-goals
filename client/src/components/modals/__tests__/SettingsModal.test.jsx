import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import SettingsModal from '../SettingsModal';

const { state, listConnections } = vi.hoisted(() => ({
    state: { flags: {}, mobile: false, onboarding: null },
    listConnections: vi.fn(),
}));

vi.mock('../../../hooks/useFeatureFlags', async (importOriginal) => ({
    ...(await importOriginal()),
    useFeatureFlags: () => ({ flags: state.flags }),
}));
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => state.mobile }));
vi.mock('../../../contexts/OnboardingContext', () => ({ useOptionalOnboarding: () => state.onboarding }));
vi.mock('../../../contexts/GoalsContext', () => ({ useGoals: () => ({ activeRootId: 'root-1' }) }));
vi.mock('../../../utils/api', () => ({ agentApi: { listConnections: () => listConnections() } }));
vi.mock('../../settings/GeneralSettings', () => ({ default: () => <p>General section</p> }));
vi.mock('../../settings/AccountSettings', () => ({ default: () => <p>Account section</p> }));
vi.mock('../../settings/StorageConnectionsPanel', () => ({ default: () => <p>Storage section</p> }));
vi.mock('../../agent/AgentConnectionsPanel', () => ({ default: () => <p>AI section</p> }));
vi.mock('../../GoalCharacteristicsSettings', () => ({ default: () => <p>Characteristics section</p> }));
vi.mock('../../onboarding/OnboardingSettingsPanel', () => ({ default: () => <p>Onboarding section</p> }));

function renderSettings(props = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <SettingsModal isOpen onClose={vi.fn()} {...props} />
        </QueryClientProvider>,
    );
}

describe('SettingsModal', () => {
    beforeEach(() => {
        state.flags = {};
        state.mobile = false;
        state.onboarding = null;
        listConnections.mockReset().mockResolvedValue({ data: { items: [] } });
    });

    it('hides AI Connections while its flags are off and nothing is connected', async () => {
        renderSettings();
        await waitFor(() => expect(listConnections).toHaveBeenCalled());
        expect(screen.queryByRole('tab', { name: 'AI Connections' })).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
    });

    it('keeps AI Connections for a user who still has a connection to revoke', async () => {
        listConnections.mockResolvedValue({ data: { items: [{ id: 'grant-1' }] } });
        renderSettings();
        expect(await screen.findByRole('tab', { name: 'AI Connections' })).toBeInTheDocument();
    });

    it('shows AI Connections when a flag is on, and opens a deep link to it', () => {
        state.flags = { ai_agent_connectors: true };
        renderSettings({ initialTab: 'ai-connections' });
        expect(screen.getByRole('tab', { name: 'AI Connections' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel')).toHaveTextContent('AI section');
        expect(listConnections).not.toHaveBeenCalled();
    });

    it('leaves out Goal Characteristics outside a fractal, falling back to General for its link', () => {
        renderSettings({ inFractal: false, initialTab: 'styling' });
        expect(screen.queryByRole('tab', { name: 'Goal Characteristics' })).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Account' })).toBeInTheDocument();
        expect(screen.getByRole('tabpanel')).toHaveTextContent('General section');
    });

    it('shows Goal Characteristics inside a fractal', () => {
        renderSettings({ initialTab: 'styling' });
        expect(screen.getByRole('tabpanel')).toHaveTextContent('Characteristics section');
    });

    it('falls back to General for a deep link to a hidden section', () => {
        renderSettings({ initialTab: 'getting-started' });
        expect(screen.getByRole('tabpanel')).toHaveTextContent('General section');
    });

    it('moves between sections with the arrow keys', () => {
        renderSettings();
        const general = screen.getByRole('tab', { name: 'General' });
        general.focus();
        fireEvent.keyDown(general, { key: 'ArrowDown' });
        const characteristics = screen.getByRole('tab', { name: 'Goal Characteristics' });
        expect(characteristics).toHaveAttribute('aria-selected', 'true');
        expect(characteristics).toHaveFocus();
        expect(screen.getByRole('tabpanel')).toHaveTextContent('Characteristics section');
        fireEvent.keyDown(characteristics, { key: 'End' });
        expect(screen.getByRole('tab', { name: 'Cloud Storage' })).toHaveAttribute('aria-selected', 'true');
        expect(general).toHaveAttribute('tabindex', '-1');
    });

    it('drills into one section at a time on phones', () => {
        state.mobile = true;
        renderSettings();
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Account/ }));
        expect(screen.getByText('Account section')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'All settings' }));
        expect(screen.getByRole('button', { name: /Cloud Storage/ })).toBeInTheDocument();
    });

    it('opens a deep-linked section directly on phones', () => {
        state.mobile = true;
        renderSettings({ initialTab: 'storage' });
        expect(screen.getByText('Storage section')).toBeInTheDocument();
    });
});
