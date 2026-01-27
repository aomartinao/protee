import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { Chat } from '@/pages/Chat';
import { Advisor } from '@/pages/Advisor';
import { Coach } from '@/pages/Coach';
import { History } from '@/pages/History';
import { Settings } from '@/pages/Settings';
import { SwipeProvider } from '@/context/SwipeContext';
import { initializeAuth, useAuthStore } from '@/store/useAuthStore';
import { hasFeature } from '@/lib/features';

// Wrapper that shows Coach for beta users, Advisor for others
function AdvisorOrCoach() {
  const { user } = useAuthStore();
  const isBeta = hasFeature('buddy-v2', user?.email);
  return isBeta ? <Coach /> : <Advisor />;
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
            <Route path="chat" element={<Chat />} />
            <Route path="advisor" element={<AdvisorOrCoach />} />
            <Route path="history" element={<History />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SwipeProvider>
  );
}

export default App;
