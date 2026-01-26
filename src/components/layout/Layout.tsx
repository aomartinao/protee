import { Outlet, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { useCallback } from 'react';

export function Layout() {
  const navigate = useNavigate();
  const { syncData, isSyncing, user } = useAuthStore();
  const { showFloatingAddButton } = useStore();

  const handleRefresh = useCallback(async () => {
    if (!user) return;
    await syncData();
  }, [syncData, user]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <PullToRefresh
        onRefresh={handleRefresh}
        disabled={isSyncing}
        className="flex-1 pb-24"
      >
        <Outlet />
      </PullToRefresh>
      <MobileNav />

      {/* Floating Add Button - rendered at root level to stay fixed */}
      {showFloatingAddButton && (
        <Button
          size="icon"
          className="fixed bottom-24 right-4 h-14 w-14 rounded-full shadow-lg z-50"
          onClick={() => navigate('/chat')}
        >
          <Plus className="h-7 w-7" />
        </Button>
      )}
    </div>
  );
}
