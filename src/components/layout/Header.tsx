import { useState, useEffect, useRef } from 'react';
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

  // Celebration particles state
  const [showCelebration, setShowCelebration] = useState(false);
  const prevPercentRef = useRef(insights.percentComplete);

  // Detect when we cross the 100% threshold
  useEffect(() => {
    const wasBelow = prevPercentRef.current < 100;
    const isNowComplete = insights.percentComplete >= 100;

    if (wasBelow && isNowComplete && isCoachPage) {
      setShowCelebration(true);
      // Hide after animation completes (longer for full-page drop)
      const timer = setTimeout(() => setShowCelebration(false), 3500);
      return () => clearTimeout(timer);
    }

    prevPercentRef.current = insights.percentComplete;
  }, [insights.percentComplete, isCoachPage]);

  // Generate particles for celebration - burst up then fall like water drops
  const particles = showCelebration ? Array.from({ length: 80 }, (_, i) => {
    const burstHeight = 20 + Math.random() * 40; // How high they burst up (px)
    const horizontalDrift = (Math.random() - 0.5) * 120; // Slight horizontal movement
    return {
      id: i,
      x: Math.random() * 100, // % position across the screen
      burstHeight,
      horizontalDrift,
      size: 3 + Math.random() * 4, // Smaller particles (3-7px)
      color: ['bg-lime-300', 'bg-lime-400', 'bg-yellow-300', 'bg-yellow-400', 'bg-amber-300'][Math.floor(Math.random() * 5)],
      delay: Math.random() * 0.5, // Staggered start
      duration: 1.2 + Math.random() * 0.8, // Total animation duration
    };
  }) : [];

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

  // Progress colors: red (0%) → amber (50%) → lime-yellow (100%)
  const percent = insights.percentComplete;

  const getProgressBgColor = () => {
    if (percent >= 100) return 'bg-lime-400';
    if (percent >= 75) return 'bg-lime-500';
    if (percent >= 50) return 'bg-amber-500';
    if (percent >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getProgressTextColor = () => {
    if (percent >= 100) return 'text-lime-500';
    if (percent >= 75) return 'text-lime-600';
    if (percent >= 50) return 'text-amber-600';
    if (percent >= 25) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-background safe-area-inset-top">
        <div className="flex h-14 items-center justify-between px-4">
          {isDashboardPage ? renderDashboardTitle() : isCoachPage ? (
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-foreground">Coach</h1>
              <div className="flex items-baseline gap-1 text-sm">
                <span className={`font-semibold transition-colors duration-300 ${getProgressTextColor()}`}>
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
        {/* Progress bar for Coach page */}
        {isCoachPage && (
          <div className="h-1 bg-gray-200 dark:bg-gray-700">
            <div
              className={`h-full transition-all duration-500 ${getProgressBgColor()} ${showCelebration ? 'animate-pulse shadow-lg shadow-lime-400/50' : ''}`}
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
        )}
      </header>

      {/* Full-screen celebration particles - burst up then fall like water drops */}
      {showCelebration && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {particles.map((p) => (
            <div
              key={p.id}
              className={`absolute rounded-full ${p.color}`}
              style={{
                left: `${p.x}%`,
                top: 60, // Start at header/progress bar level
                width: p.size,
                height: p.size,
                animation: `particle-drop ${p.duration}s ease-in ${p.delay}s forwards`,
                '--burst-height': `${p.burstHeight}px`,
                '--drift': `${p.horizontalDrift}px`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

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
