import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import AppRouter from './AppRouter.jsx'
import { ActivitiesProvider } from './contexts/ActivitiesContext.jsx'

import { SessionsProvider } from './contexts/SessionsContext.jsx'

import { GoalsProvider } from './contexts/GoalsContext.jsx'

import { TimezoneProvider } from './contexts/TimezoneContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <TimezoneProvider>
        <ActivitiesProvider>
          <SessionsProvider>
            <GoalsProvider>
              <AppRouter />
            </GoalsProvider>
          </SessionsProvider>
        </ActivitiesProvider>
      </TimezoneProvider>
    </BrowserRouter>
  </StrictMode>,
)

