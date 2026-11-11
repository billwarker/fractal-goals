import React from 'react';
import { ActivitiesProvider } from './contexts/ActivitiesContext';
import { AuthProvider } from './contexts/AuthContext';
import { GoalLevelsProvider } from './contexts/GoalLevelsContext';
import { GoalsProvider } from './contexts/GoalsContext';
import { OnboardingProvider } from './contexts/OnboardingContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TimezoneProvider } from './contexts/TimezoneContext';
import { OutboxProvider } from './offline/OutboxContext';

// Canonical data/provider envelope shared by the authenticated app and the
// public landing experience. Keeping this composition in one place prevents
// shared read-only components from losing a required context when entry points
// are split for performance.
export default function ApplicationProviders({ children }) {
    return (
        <TimezoneProvider>
            <AuthProvider>
                {/* Above goal levels, whose colours adapt to the resolved theme. */}
                <ThemeProvider>
                    <OutboxProvider>
                        <OnboardingProvider>
                            <GoalLevelsProvider>
                                <GoalsProvider>
                                    <ActivitiesProvider>{children}</ActivitiesProvider>
                                </GoalsProvider>
                            </GoalLevelsProvider>
                        </OnboardingProvider>
                    </OutboxProvider>
                </ThemeProvider>
            </AuthProvider>
        </TimezoneProvider>
    );
}
