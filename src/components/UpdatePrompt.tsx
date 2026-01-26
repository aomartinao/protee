import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export function UpdatePrompt() {
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

  if (!needRefresh) return null;

  return (
    <button
      onClick={() => updateServiceWorker(true)}
      className={cn(
        'fixed bottom-16 left-4 right-4 z-50',
        'flex items-center justify-center gap-2',
        'bg-primary text-primary-foreground',
        'py-3 px-4 rounded-xl shadow-lg',
        'animate-in slide-in-from-bottom-4 duration-300',
        'active:scale-[0.98] transition-transform'
      )}
    >
      <RefreshCw className="h-4 w-4" />
      <span className="font-medium">Update available · Tap to refresh</span>
    </button>
  );
}
