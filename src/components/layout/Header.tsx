import { Settings, LogOut } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';

export function Header() {
  const location = useLocation();
  const { user, signOut } = useAuthStore();

  const getTitle = () => {
    switch (location.pathname) {
      case '/':
        return format(new Date(), 'EEE, MMM d');
      case '/chat':
        return 'Log Food';
      case '/history':
        return 'History';
      case '/settings':
        return 'Settings';
      default:
        return 'Protee';
    }
  };

  const isSettingsPage = location.pathname === '/settings';

  return (
    <header className="sticky top-0 z-40 w-full bg-background safe-area-inset-top">
      <div className="flex h-14 items-center justify-between px-4">
        <h1 className="text-xl font-semibold text-foreground">{getTitle()}</h1>
        {!isSettingsPage ? (
          <Link to="/settings">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-muted">
              <Settings className="h-5 w-5" />
              <span className="sr-only">Settings</span>
            </Button>
          </Link>
        ) : user ? (
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-muted text-muted-foreground hover:text-destructive"
            onClick={() => signOut()}
          >
            <LogOut className="h-5 w-5" />
            <span className="sr-only">Sign out</span>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
