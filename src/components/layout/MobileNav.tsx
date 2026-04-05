import { Home, MessageSquare, Sparkles, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Today', end: true },
  { to: '/coach', icon: MessageSquare, label: 'Chat', end: true },
  { to: '/insights', icon: Sparkles, label: 'Insights', end: false },
  { to: '/settings', icon: Settings, label: 'Settings', end: true },
];

export function MobileNav() {
  return (
    <nav className="fixed bottom-4 left-4 right-4 z-50 bg-white/70 backdrop-blur-xl border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.05)] rounded-[24px]">
      <div className="flex items-center justify-around h-14 px-2">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center flex-1 h-11 gap-0.5 text-[11px] transition-all duration-300 rounded-full mx-0.5',
                isActive
                  ? 'text-amber-600 scale-105'
                  : 'text-gray-500 hover:text-gray-700 active:scale-95'
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className={cn(
                  'relative p-1.5 rounded-full transition-all duration-300',
                  isActive ? 'bg-amber-500/15' : 'opacity-60'
                )}>
                  <Icon
                    strokeWidth={isActive ? 2.5 : 2}
                    className={cn('h-5 w-5 transition-all duration-300', isActive && 'drop-shadow-sm')}
                  />
                  {isActive && <div className="absolute inset-0 rounded-full bg-amber-500/10 blur-md -z-10" />}
                </div>
                <span className={cn('font-medium transition-all duration-300', isActive ? 'opacity-100' : 'opacity-70')}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
