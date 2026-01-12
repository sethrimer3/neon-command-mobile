import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";
import { useEffect } from 'react';
import "@github/spark/spark"
import { Toaster } from './components/ui/sonner'

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'
import { initializeStartupOverlay, dismissStartupOverlay, setupSafetyTimeout, setupLoadEventDismissal } from './lib/loadingScreen.ts'

import "./main.css"
import "./styles/theme.css"
import "./styles/loading.css"
import "./index.css"

// Initialize loading screen immediately
initializeStartupOverlay();

// Set up a safety timeout to ensure the overlay is dismissed even if React fails to mount
setupSafetyTimeout();
// Dismiss the overlay after the window load event in case React never mounts.
setupLoadEventDismissal();

function AppWrapper() {
  useEffect(() => {
    // Dismiss loading screen after React app mounts
    dismissStartupOverlay();
  }, []);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <App />
      <Toaster />
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(<AppWrapper />)
