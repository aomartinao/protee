import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { Chat } from '@/pages/Chat';
import { UnifiedChat } from '@/pages/UnifiedChat';
import { History } from '@/pages/History';
import { Settings } from '@/pages/Settings';
import { SwipeProvider } from '@/context/SwipeContext';
import { Toaster } from '@/components/ui/toaster';
import { initializeAuth, useAuthStore } from '@/store/useAuthStore';
import { hasFeature } from '@/lib/features';
import { Analytics } from '@vercel/analytics/react';

// Coach page - unified experience for beta users, old Chat for others
function CoachPage() {
  const { user } = useAuthStore();
  const isBeta = hasFeature('buddy-v2', user?.email);
  return isBeta ? <UnifiedChat /> : <Chat />;
}

function App() {
  // Initialize Supabase auth on app load
  useEffect(() => {
    initializeAuth();
  }, []);

  return (
    <SwipeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="coach" element={<CoachPage />} />
            {/* Legacy routes redirect to /coach */}
            <Route path="chat" element={<Navigate to="/coach" replace />} />
            <Route path="advisor" element={<Navigate to="/coach" replace />} />
            <Route path="history" element={<History />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
      <Analytics />
    </SwipeProvider>
  );
}

export default App;
