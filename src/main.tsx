import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";
import { useEffect } from 'react';
import "@github/spark/spark"
import { Toaster } from './components/ui/sonner'

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'
import { initializeStartupOverlay, dismissStartupOverlay } from './lib/loadingScreen.ts'

import "./main.css"
import "./styles/theme.css"
import "./styles/loading.css"
import "./index.css"

// Initialize loading screen immediately
initializeStartupOverlay();

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
