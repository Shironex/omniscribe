import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from '@/components';
import { Toaster } from '@/components/ui/sonner';
import { useWorkspaceStore, useConnectionStore } from '@/stores';
import './styles/globals.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <Toaster />
    </ErrorBoundary>
  </StrictMode>
);

// Expose stores on window for E2E testing.
// Allows Playwright to open projects, check connection state, etc.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__testStores = {
    workspace: useWorkspaceStore,
    connection: useConnectionStore,
  };
}
