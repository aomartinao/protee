import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Debug functions only available in development mode
if (import.meta.env.DEV) {
  // Dynamic import to avoid bundling debug code in production
  import('./services/sync').then(({ debugCloudEntries, debugLocalEntries, clearSyncMeta, fullSync }) => {
    import('./store/useAuthStore').then(({ useAuthStore }) => {
      (window as Window & { proteeDebug?: unknown }).proteeDebug = {
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
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
