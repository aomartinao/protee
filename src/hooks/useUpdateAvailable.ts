import { useRegisterSW } from 'virtual:pwa-register/react';

export function useUpdateAvailable() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Check for updates every 60 seconds
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 60 * 1000);
      }
      console.log('[PWA] Service worker registered:', swUrl);
    },
    onRegisterError(error) {
      console.error('[PWA] Service worker registration error:', error);
    },
  });

  const updateApp = () => {
    updateServiceWorker(true);
  };

  return { updateAvailable: needRefresh, updateApp };
}
