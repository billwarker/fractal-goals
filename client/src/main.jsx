import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import AppRouter from './AppRouter.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { ActivitiesProvider } from './contexts/ActivitiesContext.jsx'

import { SessionsProvider } from './contexts/SessionsContext.jsx'

import { GoalsProvider } from './contexts/GoalsContext.jsx'

import { TimezoneProvider } from './contexts/TimezoneContext.jsx'

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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DebugProvider>
          <QueryDevtools />
          <TimezoneProvider>
            <AuthProvider>
              <ActivitiesProvider>
                <SessionsProvider>
                  <GoalsProvider>
                    <AppRouter />
                  </GoalsProvider>
                </SessionsProvider>
              </ActivitiesProvider>
            </AuthProvider>
          </TimezoneProvider>
        </DebugProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

