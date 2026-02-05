import { useState } from 'react';
import { Settings, LogOut, Trash2, CalendarCheck, RefreshCw, Target, Loader2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { version } from '../../../package.json';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { useUpdateAvailable } from '@/hooks/useUpdateAvailable';
import { useProgressInsights } from '@/hooks/useProgressInsights';
import { useSettings } from '@/hooks/useProteinData';
import { clearAllChatMessages } from '@/db';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';

export function Header() {
  const location = useLocation();
  const { user, signOut } = useAuthStore();
  const { clearMessages, clearAdvisorMessages, dashboardShowTodayButton, dashboardOnToday } = useStore();
  useUpdateAvailable(); // Hook for update detection (used in popover)
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [advisorClearDialogOpen, setAdvisorClearDialogOpen] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'current'>('idle');

  // Progress data for Coach page
  const isCoachPage = location.pathname === '/coach' || location.pathname === '/chat' || location.pathname === '/advisor';
  const insights = useProgressInsights();
  const { settings } = useSettings();

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus('checking');

    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) {
        await registration.update();

        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          window.location.reload();
        } else {
          setUpdateStatus('current');
          setTimeout(() => setUpdateStatus('idle'), 2000);
        }
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      window.location.reload();
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const getTitle = () => {
    switch (location.pathname) {
      case '/':
        // Dashboard title with icon - rendered separately with Popover
        return null;
      case '/coach':
      case '/chat':
      case '/advisor':
        return 'Coach';
      case '/history':
        return 'History';
      case '/settings':
        return 'Settings';
      default:
        return 'Protee';
    }
  };

  const isSettingsPage = location.pathname === '/settings';
  const isDashboardPage = location.pathname === '/';

  const handleClearChat = async () => {
    await clearAllChatMessages();
    clearMessages();
    setClearDialogOpen(false);
  };

  const handleClearAdvisor = () => {
    clearAdvisorMessages();
    setAdvisorClearDialogOpen(false);
  };

  const renderHeaderAction = () => {
    if (isCoachPage) {
      return (
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover:bg-muted text-muted-foreground hover:text-destructive"
          onClick={() => setClearDialogOpen(true)}
        >
          <Trash2 className="h-5 w-5" />
          <span className="sr-only">Clear chat</span>
        </Button>
      );
    }

    if (isSettingsPage) {
      return user ? (
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover:bg-muted text-muted-foreground hover:text-destructive"
          onClick={() => signOut()}
        >
          <LogOut className="h-5 w-5" />
          <span className="sr-only">Sign out</span>
        </Button>
      ) : null;
    }

    // On Dashboard, show Today button when viewing past days
    if (isDashboardPage && dashboardShowTodayButton && dashboardOnToday) {
      return (
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full hover:bg-muted gap-1.5"
          onClick={dashboardOnToday}
        >
          <CalendarCheck className="h-4 w-4" />
          Today
        </Button>
      );
    }

    // On Dashboard (when on Today), no right-side action needed (popover is in title)
    if (isDashboardPage) {
      return null;
    }

    return (
      <Link to="/settings">
        <Button variant="ghost" size="icon" className="rounded-full hover:bg-muted">
          <Settings className="h-5 w-5" />
          <span className="sr-only">Settings</span>
        </Button>
      </Link>
    );
  };

  const renderDashboardTitle = () => (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Target className="h-6 w-6 text-amber-500" />
          <span className="text-xl font-semibold text-foreground">Protee</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-6 w-6 text-amber-500" />
            <div>
              <h4 className="font-semibold">Protee</h4>
              <p className="text-xs text-muted-foreground">v{version}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            AI-powered protein tracking to hit your daily goals
          </p>
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Feedback welcome at{' '}
              <a
                href="mailto:martin.holecko@gmail.com"
                className="text-primary hover:underline"
              >
                martin.holecko@gmail.com
              </a>
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/settings" className="flex-1">
              <Button variant="outline" size="sm" className="w-full gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
              onClick={handleCheckForUpdates}
              disabled={isCheckingUpdate}
            >
              {isCheckingUpdate ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {updateStatus === 'current' ? 'Up to date' : 'Update'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-background safe-area-inset-top">
        <div className="flex h-14 items-center justify-between px-4">
          {isDashboardPage ? renderDashboardTitle() : isCoachPage ? (
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-foreground">Coach</h1>
              <div className="flex items-baseline gap-1 text-sm">
                <span className={`font-semibold ${insights.percentComplete >= 100 ? 'text-green-600' : 'text-primary'}`}>
                  {insights.todayProtein}g
                </span>
                <span className="text-muted-foreground">/ {settings.defaultGoal}g</span>
                {insights.currentStreak > 0 && (
                  <span className="ml-1 text-orange-500 text-xs">🔥{insights.currentStreak}</span>
                )}
              </div>
            </div>
          ) : (
            <h1 className="text-xl font-semibold text-foreground">{getTitle()}</h1>
          )}
          {renderHeaderAction()}
        </div>
      </header>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all messages in the log. Your saved food entries will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearChat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={advisorClearDialogOpen} onOpenChange={setAdvisorClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear your current Food Buddy conversation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAdvisor} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
