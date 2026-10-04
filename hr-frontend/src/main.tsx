import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyUiPrefs } from './lib/uiPrefs'

// Apply saved theme/density before first paint (monochrome overhaul).
applyUiPrefs()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
