import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { Chat } from '@/pages/Chat';
import { Advisor } from '@/pages/Advisor';
import { History } from '@/pages/History';
import { Settings } from '@/pages/Settings';
import { initializeAuth } from '@/store/useAuthStore';

function App() {
  // Initialize Supabase auth on app load
  useEffect(() => {
    initializeAuth();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="chat" element={<Chat />} />
          <Route path="advisor" element={<Advisor />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
