import { useState } from 'react';
import { Cloud, CloudOff, RefreshCw, Check, AlertCircle, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatDistanceToNow } from 'date-fns';

export function SyncStatus() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const {
    user,
    lastSyncTime,
    isSyncing,
    syncError,
    syncData,
    signOut,
  } = useAuthStore();

  const isConfigured = isSupabaseConfigured();
  const isLoggedIn = !!user;

  const handleSync = async () => {
    await syncData();
  };

  const handleForceSync = async () => {
    // Clear sync timestamps to force a full re-sync
    await clearSyncMeta();
    await syncData();
  };

  const handleSignOut = async () => {
    await signOut();
  };

  // Not configured
  if (!isConfigured) {
    return (
      <Card variant="default">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CloudOff className="h-5 w-5 text-muted-foreground" />
            Cloud Sync
          </CardTitle>
          <CardDescription>
            Cloud sync is not configured. Add Supabase credentials to enable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            To enable cloud sync, configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
            in your environment.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Not logged in
  if (!isLoggedIn) {
    return (
      <Card variant="default">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            Cloud Sync
          </CardTitle>
          <CardDescription>
            Sign in to backup your data to the cloud and sync across devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full">
                <User className="h-4 w-4 mr-2" />
                Sign In or Create Account
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md p-0 border-0 bg-transparent shadow-none">
              <DialogHeader className="sr-only">
                <DialogTitle>Authentication</DialogTitle>
              </DialogHeader>
              <AuthScreen onClose={() => setAuthDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  // Logged in
  return (
    <Card variant="default">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Cloud className="h-5 w-5 text-primary" />
          Cloud Sync
        </CardTitle>
        <CardDescription className="flex items-center gap-1">
          <span>Signed in as</span>
          <span className="font-medium text-foreground">{user.email}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sync status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            {isSyncing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm">Syncing...</span>
              </>
            ) : syncError ? (
              <>
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive">{syncError}</span>
              </>
            ) : lastSyncTime ? (
              <>
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-sm">
                  Last synced {formatDistanceToNow(lastSyncTime, { addSuffix: true })}
                </span>
              </>
            ) : (
              <>
                <Cloud className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Not synced yet</span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleSync}
            disabled={isSyncing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            Sync Now
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        {/* Force sync option for troubleshooting */}
        <button
          onClick={handleForceSync}
          disabled={isSyncing}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Force full re-sync (if items are missing)
        </button>
      </CardContent>
    </Card>
  );
}
