import { useState } from 'react';
import { Settings, LogOut, Trash2, CalendarCheck, RefreshCw } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { version } from '../../../package.json';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { useUpdateAvailable } from '@/hooks/useUpdateAvailable';
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

export function Header() {
  const location = useLocation();
  const { user, signOut } = useAuthStore();
  const { clearMessages, clearAdvisorMessages, dashboardShowTodayButton, dashboardOnToday } = useStore();
  const { updateAvailable, updateApp } = useUpdateAvailable();
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [advisorClearDialogOpen, setAdvisorClearDialogOpen] = useState(false);

  const getTitle = () => {
    switch (location.pathname) {
      case '/':
        return (
          <span className="flex items-center gap-2">
            Protee
            <span className="text-xs font-normal text-muted-foreground">v{version}</span>
            {updateAvailable && (
              <button
                onClick={updateApp}
                className="text-xs font-normal text-primary hover:underline flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                update
              </button>
            )}
          </span>
        );
      case '/chat':
        return 'Log Food';
      case '/history':
        return 'History';
      case '/settings':
        return 'Settings';
      case '/advisor':
        return 'Food Buddy (beta)';
      default:
        return 'Protee';
    }
  };

  const isSettingsPage = location.pathname === '/settings';
  const isChatPage = location.pathname === '/chat';
  const isAdvisorPage = location.pathname === '/advisor';
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
    if (isChatPage) {
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

    if (isAdvisorPage) {
      return (
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover:bg-muted text-muted-foreground hover:text-destructive"
          onClick={() => setAdvisorClearDialogOpen(true)}
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

    return (
      <Link to="/settings">
        <Button variant="ghost" size="icon" className="rounded-full hover:bg-muted">
          <Settings className="h-5 w-5" />
          <span className="sr-only">Settings</span>
        </Button>
      </Link>
    );
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-background safe-area-inset-top">
        <div className="flex h-14 items-center justify-between px-4">
          <h1 className="text-xl font-semibold text-foreground">{getTitle()}</h1>
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
