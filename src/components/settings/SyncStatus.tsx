import { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, Check, AlertCircle, ChevronRight, AlertTriangle, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/store/useAuthStore';
import { isSupabaseConfigured } from '@/services/supabase';
import { clearSyncMeta } from '@/services/sync';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { formatDistanceToNow, differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';

// Warning threshold: show warning if data hasn't synced in this many minutes
const SYNC_WARNING_THRESHOLD_MINUTES = 10;

export function SyncStatus() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const {
    user,
    lastSyncTime,
    isSyncing,
    syncError,
    syncData,
    pendingSyncCount,
    isOnline,
    updatePendingCount,
  } = useAuthStore();

  const isConfigured = isSupabaseConfigured();
  const isLoggedIn = !!user;

  // Update pending count periodically when logged in
  useEffect(() => {
    if (isLoggedIn) {
      updatePendingCount();
      const interval = setInterval(updatePendingCount, 30000); // Every 30 seconds
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, updatePendingCount]);

  // Check if we should show a warning (data pending and hasn't synced recently)
  const minutesSinceSync = lastSyncTime
    ? differenceInMinutes(new Date(), lastSyncTime)
    : Infinity;
  const showSyncWarning = pendingSyncCount > 0 && minutesSinceSync > SYNC_WARNING_THRESHOLD_MINUTES;
  const showOfflineWarning = !isOnline && pendingSyncCount > 0;

  const handleSync = async () => {
    await syncData();
  };

  const handleForceSync = async () => {
    await clearSyncMeta();
    await syncData();
  };

  // Wrapper for consistent styling
  const SectionWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-card rounded-2xl overflow-hidden shadow-sm">
      {children}
    </div>
  );

  // Not configured - minimal display
  if (!isConfigured) {
    return (
      <SectionWrapper>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <CloudOff className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">Cloud Sync</div>
              <div className="text-xs text-muted-foreground">Not configured</div>
            </div>
          </div>
        </div>
      </SectionWrapper>
    );
  }

  // Not logged in
  if (!isLoggedIn) {
    return (
      <SectionWrapper>
        <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/50 active:bg-muted transition-colors">
              <div className="flex items-center gap-3">
                <Cloud className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-sm font-medium">Cloud Sync</div>
                  <div className="text-xs text-muted-foreground">Sign in to backup & sync</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md p-0 border-0 bg-transparent shadow-none">
            <DialogHeader className="sr-only">
              <DialogTitle>Authentication</DialogTitle>
            </DialogHeader>
            <AuthScreen onClose={() => setAuthDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </SectionWrapper>
    );
  }

  // Logged in - compact view
  const statusIcon = isSyncing ? (
    <RefreshCw className="h-4 w-4 animate-spin text-primary" />
  ) : !isOnline ? (
    <WifiOff className="h-4 w-4 text-amber-500" />
  ) : syncError ? (
    <AlertCircle className="h-4 w-4 text-destructive" />
  ) : pendingSyncCount > 0 ? (
    <AlertTriangle className="h-4 w-4 text-amber-500" />
  ) : lastSyncTime ? (
    <Check className="h-4 w-4 text-green-500" />
  ) : (
    <Cloud className="h-4 w-4 text-muted-foreground" />
  );

  const statusText = isSyncing
    ? 'Syncing...'
    : !isOnline
    ? 'Offline'
    : syncError
    ? 'Sync error'
    : pendingSyncCount > 0
    ? `${pendingSyncCount} pending`
    : lastSyncTime
    ? `Synced ${formatDistanceToNow(lastSyncTime, { addSuffix: true })}`
    : 'Not synced';

  return (
    <SectionWrapper>
      <div className="px-4 py-3 space-y-3">
        {/* Warning banner for unsynced data */}
        {(showSyncWarning || showOfflineWarning) && (
          <div className={cn(
            'flex items-start gap-2 p-2 rounded-lg text-xs',
            showOfflineWarning ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-destructive/10 text-destructive'
          )}>
            {showOfflineWarning ? (
              <WifiOff className="h-4 w-4 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-medium">
                {showOfflineWarning ? 'You\'re offline' : 'Data not backed up'}
              </div>
              <div className="opacity-80">
                {pendingSyncCount} {pendingSyncCount === 1 ? 'entry' : 'entries'} waiting to sync.
                {showOfflineWarning
                  ? ' Will sync when connection is restored.'
                  : ' Connect to sync your data.'}
              </div>
            </div>
          </div>
        )}

        {/* Main row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-primary" />
            <div className="min-w-0">
              <div className="text-sm font-medium">Cloud Sync</div>
              <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                {user.email}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusIcon}
            <span className={cn(
              'text-xs',
              syncError ? 'text-destructive' : pendingSyncCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
            )}>
              {statusText}
            </span>
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <button
            onClick={handleForceSync}
            disabled={isSyncing}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Force re-sync
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="h-7 px-3 text-xs"
          >
            <RefreshCw className={cn('h-3 w-3 mr-1', isSyncing && 'animate-spin')} />
            Sync
          </Button>
        </div>
      </div>
    </SectionWrapper>
  );
}
