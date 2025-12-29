import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import AppRouter from './AppRouter.jsx'
import { ActivitiesProvider } from './contexts/ActivitiesContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ActivitiesProvider>
        <AppRouter />
      </ActivitiesProvider>
    </BrowserRouter>
  </StrictMode>,
)

