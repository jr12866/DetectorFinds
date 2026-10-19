import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { runStartupMaintenance } from './db/startup'
import './app.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('missing #root element')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Rendered first, then maintained: the Bin's 30-day expiry only happens if
// something asks for it, and the screen that would ask is step 04. Nothing here
// is awaited, because a slow purge is a reason to keep the phone waiting for no
// visible gain, and the helper reports its failures rather than throwing them.
void runStartupMaintenance().then((result) => {
  if (result.error) console.warn('startup Bin purge failed:', result.error)
  else if (result.purged > 0) console.info(`startup Bin purge destroyed ${result.purged} entries past 30 days`)
})
