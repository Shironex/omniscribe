import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from '@/components';
import { SplashScreen } from '@/components/splash';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useWorkspaceStore, useConnectionStore } from '@/stores';
import './styles/globals.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        <SplashScreen />
        <App />
        <Toaster />
      </TooltipProvider>
    </ErrorBoundary>
  </StrictMode>
);

// Expose stores on window for E2E testing.
// Allows Playwright to open projects, check connection state, etc.
// This is a desktop Electron app -- window globals are already accessible
// via devtools, so exposing stores adds no meaningful attack surface.
(window as unknown as Record<string, unknown>).__testStores = {
  workspace: useWorkspaceStore,
  connection: useConnectionStore,
};
