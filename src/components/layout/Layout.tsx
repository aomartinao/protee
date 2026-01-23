import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { useAuthStore } from '@/store/useAuthStore';
import { useCallback, useState } from 'react';

export function Layout() {
  const { syncData, isSyncing, user } = useAuthStore();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    if (!user) {
      setSyncMessage('Sign in to sync across devices');
      setTimeout(() => setSyncMessage(null), 2000);
      return;
    }

    const result = await syncData();

    if (result.success) {
      const parts: string[] = [];
      const totalPushed = (result.pushed || 0) + (result.messagesPushed || 0);
      const totalPulled = (result.pulled || 0) + (result.messagesPulled || 0);

      if (totalPushed > 0) parts.push(`${totalPushed} pushed`);
      if (totalPulled > 0) parts.push(`${totalPulled} pulled`);
      if (result.settingsSynced) parts.push('settings synced');

      setSyncMessage(parts.length > 0 ? `Synced: ${parts.join(', ')}` : 'Already up to date');
    } else {
      setSyncMessage(result.error || 'Sync failed');
    }

    setTimeout(() => setSyncMessage(null), 2000);
  }, [syncData, user]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <PullToRefresh
        onRefresh={handleRefresh}
        disabled={isSyncing}
        className="flex-1 pb-24"
      >
        {/* Sync message banner */}
        {syncMessage && (
          <div className="bg-primary/10 text-primary text-center py-2 text-sm font-medium">
            {syncMessage}
          </div>
        )}
        <Outlet />
      </PullToRefresh>
      <MobileNav />
    </div>
  );
}
