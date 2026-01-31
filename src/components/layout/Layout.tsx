import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { FloatingAddButton } from './FloatingAddButton';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { useCallback } from 'react';

export function Layout() {
  const location = useLocation();
  const { syncData, isSyncing, user } = useAuthStore();
  const { showFloatingAddButton } = useStore();

  const handleRefresh = useCallback(async () => {
    if (!user) return;
    await syncData();
  }, [syncData, user]);

  // Disable pull-to-refresh on coach page (has its own scroll container)
  const disablePullToRefresh = location.pathname === '/coach' || location.pathname === '/chat' || location.pathname === '/advisor';

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      {disablePullToRefresh ? (
        <div className="flex-1 pb-24 overflow-hidden">
          <Outlet />
        </div>
      ) : (
        <PullToRefresh
          onRefresh={handleRefresh}
          disabled={isSyncing}
          className="flex-1 pb-24"
        >
          <Outlet />
        </PullToRefresh>
      )}
      <MobileNav />

      {/* Floating Add Button - rendered at root level to stay fixed */}
      {showFloatingAddButton && <FloatingAddButton />}
    </div>
  );
}
