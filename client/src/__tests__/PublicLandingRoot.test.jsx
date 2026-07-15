import React from 'react';
import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { useActivities } from '../contexts/ActivitiesContext';
import { useAuth } from '../contexts/AuthContext';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useGoals } from '../contexts/GoalsContext';
import { useOnboarding } from '../contexts/OnboardingContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTimezone } from '../contexts/TimezoneContext';
import { PublicLandingProviders } from '../PublicLandingRoot';
import { authApi } from '../utils/api';

function PublicProviderProbe() {
    const { isAuthenticated } = useAuth();
    const { getGoalColor, getGoalIcon } = useGoalLevels();
    const { activeRootId } = useGoals();
    const { enabled: onboardingEnabled } = useOnboarding();
    const { theme } = useTheme();
    const { preference } = useTimezone();
    const { createActivity } = useActivities();
    return (
        <output aria-label="Public provider state">
            {[
                isAuthenticated,
                getGoalColor('UltimateGoal'),
                getGoalIcon('UltimateGoal'),
                theme,
                activeRootId === null,
                onboardingEnabled,
                preference,
                typeof createActivity,
            ].join(':')}
        </output>
    );
}

describe('PublicLandingProviders', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('provides anonymous auth and fallback goal levels without an API session request', async () => {
        const getCurrentUser = vi.spyOn(authApi, 'getMe');
        const storage = new Map([['theme', 'dark']]);
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key) => storage.get(key) ?? null),
            setItem: vi.fn((key, value) => storage.set(key, String(value))),
            removeItem: vi.fn((key) => storage.delete(key)),
        });
        window.history.replaceState({}, '', '/landing-preview');
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });

        render(
            <PublicLandingProviders queryClient={queryClient}>
                <PublicProviderProbe />
            </PublicLandingProviders>,
        );

        expect(await screen.findByLabelText('Public provider state'))
            .toHaveTextContent('false:#4f9cf9:twelvePointStar:dark:true:false:local:function');
        expect(getCurrentUser).not.toHaveBeenCalled();
    });
});
