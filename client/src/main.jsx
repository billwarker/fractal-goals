import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from "@sentry/react";
import { BrowserRouter } from 'react-router-dom'
import './index.css'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}
import AppRouter from './AppRouter.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { ActivitiesProvider } from './contexts/ActivitiesContext.jsx'

import { SessionsProvider } from './contexts/SessionsContext.jsx'

import { GoalsProvider } from './contexts/GoalsContext.jsx'

import { TimezoneProvider } from './contexts/TimezoneContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'

import { DebugProvider } from './contexts/DebugContext.jsx'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import { useDebug } from './contexts/DebugContext.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      cacheTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Helper to conditionally render devtools based on debug mode
const QueryDevtools = () => {
  const { debugMode } = useDebug();
  if (!debugMode) return null;
  return <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />;
};

import { Toaster } from 'react-hot-toast';
import GlobalErrorBoundary from './components/GlobalErrorBoundary.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <DebugProvider>
            <QueryDevtools />
            <Toaster
              position="bottom-center"
              toastOptions={{
                style: {
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                },
                success: {
                  duration: 3000,
                  iconTheme: {
                    primary: 'var(--color-brand-success)',
                    secondary: '#fff',
                  },
                },
                error: {
                  duration: 5000,
                  iconTheme: {
                    primary: 'var(--color-brand-danger)',
                    secondary: '#fff',
                  },
                },
              }}
            />
            <TimezoneProvider>
              <AuthProvider>
                <GoalsProvider>
                  <ThemeProvider>
                    <ActivitiesProvider>
                      <SessionsProvider>
                        <AppRouter />
                      </SessionsProvider>
                    </ActivitiesProvider>
                  </ThemeProvider>
                </GoalsProvider>
              </AuthProvider>
            </TimezoneProvider>
          </DebugProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  </StrictMode>,
)

