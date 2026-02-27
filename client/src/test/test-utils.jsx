import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TimezoneProvider } from '../contexts/TimezoneContext';
import { AuthProvider } from '../contexts/AuthContext';
import { GoalLevelsProvider } from '../contexts/GoalLevelsContext';
import { ThemeProvider } from '../contexts/ThemeContext';

function createTestQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                staleTime: 0
            },
            mutations: {
                retry: false
            }
        }
    });
}

export function renderWithProviders(
    ui,
    {
        route = '/',
        path = '*',
        queryClient = createTestQueryClient(),
        withTimezone = true,
        withAuth = true,
        withGoalLevels = true,
        withTheme = true
    } = {}
) {
    let wrappedUi = (
        <Routes>
            <Route path={path} element={ui} />
        </Routes>
    );

    if (withTheme) {
        wrappedUi = <ThemeProvider>{wrappedUi}</ThemeProvider>;
    }
    if (withGoalLevels) {
        wrappedUi = <GoalLevelsProvider>{wrappedUi}</GoalLevelsProvider>;
    }
    if (withAuth) {
        wrappedUi = <AuthProvider>{wrappedUi}</AuthProvider>;
    }
    if (withTimezone) {
        wrappedUi = <TimezoneProvider>{wrappedUi}</TimezoneProvider>;
    }

    return {
        queryClient,
        ...render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={[route]}>
                    {wrappedUi}
                </MemoryRouter>
            </QueryClientProvider>
        )
    };
}

export * from '@testing-library/react';
