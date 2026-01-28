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
              position="top-right"
              toastOptions={{
                style: {
                  background: '#333',
                  color: '#fff',
                },
                success: {
                  duration: 3000,
                  iconTheme: {
                    primary: '#4caf50',
                    secondary: '#fff',
                  },
                },
                error: {
                  duration: 5000,
                  iconTheme: {
                    primary: '#ff5252',
                    secondary: '#fff',
                  },
                },
              }}
            />
            <TimezoneProvider>
              <AuthProvider>
                <ThemeProvider>
                  <ActivitiesProvider>
                    <SessionsProvider>
                      <GoalsProvider>
                        <AppRouter />
                      </GoalsProvider>
                    </SessionsProvider>
                  </ActivitiesProvider>
                </ThemeProvider>
              </AuthProvider>
            </TimezoneProvider>
          </DebugProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  </StrictMode>,
)

