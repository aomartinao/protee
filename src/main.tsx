import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { debugCloudEntries, debugLocalEntries, clearSyncMeta, fullSync } from './services/sync';
import { useAuthStore } from './store/useAuthStore';

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed, but app will still work
    });
  });
}

// Expose debug functions on window for console testing
declare global {
  interface Window {
    proteeDebug: {
      checkCloud: () => Promise<void>;
      checkLocal: () => Promise<void>;
      clearSyncMeta: () => Promise<void>;
      forceSync: () => Promise<void>;
      getUserId: () => string | null;
    };
  }
}

window.proteeDebug = {
  checkCloud: async () => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      console.log('[Debug] Not logged in');
      return;
    }
    await debugCloudEntries(userId);
  },
  checkLocal: debugLocalEntries,
  clearSyncMeta: clearSyncMeta,
  forceSync: async () => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      console.log('[Debug] Not logged in');
      return;
    }
    await clearSyncMeta();
    const result = await fullSync(userId);
    console.log('[Debug] Force sync result:', result);
  },
  getUserId: () => useAuthStore.getState().user?.id || null,
};

console.log('[Protee] Debug functions available: window.proteeDebug.checkCloud(), checkLocal(), clearSyncMeta(), forceSync(), getUserId()');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
