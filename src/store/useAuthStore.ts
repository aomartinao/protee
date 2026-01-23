import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabase } from '@/services/supabase';
import { fullSync, pushSettingsToCloud, pullSettingsFromCloud, clearSyncMeta, type SyncResult } from '@/services/sync';
import type { UserSettings } from '@/types';
import { useStore } from './useStore';

interface AuthState {
  // Auth state
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  error: string | null;

  // Sync state
  lastSyncTime: Date | null;
  isSyncing: boolean;
  syncError: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSyncState: (state: { lastSyncTime?: Date | null; isSyncing?: boolean; syncError?: string | null }) => void;

  // Auth methods
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;

  // Sync methods
  syncData: () => Promise<SyncResult>;
  syncSettings: (settings: UserSettings) => Promise<boolean>;
  loadSettingsFromCloud: () => Promise<UserSettings | null>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      session: null,
      isLoading: true,
      error: null,
      lastSyncTime: null,
      isSyncing: false,
      syncError: null,

      // Setters
      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setSyncState: (state) => set((prev) => ({
        lastSyncTime: state.lastSyncTime ?? prev.lastSyncTime,
        isSyncing: state.isSyncing ?? prev.isSyncing,
        syncError: state.syncError ?? prev.syncError,
      })),

      // Sign up
      signUp: async (email, password) => {
        const supabase = getSupabase();
        if (!supabase) {
          return { success: false, error: 'Cloud sync not configured' };
        }

        set({ isLoading: true, error: null });

        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
          });

          if (error) {
            set({ error: error.message, isLoading: false });
            return { success: false, error: error.message };
          }

          set({
            user: data.user,
            session: data.session,
            isLoading: false,
          });

          return { success: true };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sign up failed';
          set({ error: message, isLoading: false });
          return { success: false, error: message };
        }
      },

      // Sign in
      signIn: async (email, password) => {
        const supabase = getSupabase();
        if (!supabase) {
          return { success: false, error: 'Cloud sync not configured' };
        }

        set({ isLoading: true, error: null });

        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            set({ error: error.message, isLoading: false });
            return { success: false, error: error.message };
          }

          set({
            user: data.user,
            session: data.session,
            isLoading: false,
          });

          // Trigger initial sync after login
          get().syncData();

          return { success: true };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sign in failed';
          set({ error: message, isLoading: false });
          return { success: false, error: message };
        }
      },

      // Sign out
      signOut: async () => {
        const supabase = getSupabase();
        if (supabase) {
          await supabase.auth.signOut();
        }
        // Clear sync metadata so next login gets fresh sync
        await clearSyncMeta();
        set({
          user: null,
          session: null,
          lastSyncTime: null,
          syncError: null,
        });
      },

      // Sync data
      syncData: async () => {
        const { user, isSyncing } = get();

        if (!user || isSyncing) {
          return { success: false, pushed: 0, pulled: 0, error: 'No user or sync in progress' };
        }

        set({ isSyncing: true, syncError: null });

        try {
          const result = await fullSync(user.id);

          set({
            isSyncing: false,
            lastSyncTime: result.success ? new Date() : get().lastSyncTime,
            syncError: result.error ?? null,
          });

          // Reload messages from IndexedDB if any were pulled
          if (result.success && (result.messagesPulled || 0) > 0) {
            useStore.getState().reloadMessages();
          }

          return result;
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Sync failed';
          set({ isSyncing: false, syncError: error });
          return { success: false, pushed: 0, pulled: 0, error };
        }
      },

      // Sync settings
      syncSettings: async (settings) => {
        const { user } = get();
        if (!user) return false;
        return pushSettingsToCloud(user.id, settings);
      },

      // Load settings from cloud
      loadSettingsFromCloud: async () => {
        const { user } = get();
        if (!user) return null;
        return pullSettingsFromCloud(user.id);
      },
    }),
    {
      name: 'protee-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        lastSyncTime: state.lastSyncTime,
      }),
    }
  )
);

// Auto-sync interval (5 minutes)
const AUTO_SYNC_INTERVAL = 5 * 60 * 1000;
let autoSyncTimer: ReturnType<typeof setInterval> | null = null;

// Initialize auth state from Supabase session
export async function initializeAuth() {
  const supabase = getSupabase();
  if (!supabase) {
    useAuthStore.getState().setLoading(false);
    return;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();

    useAuthStore.setState({
      session,
      user: session?.user ?? null,
      isLoading: false,
    });

    // If user is logged in, start auto-sync
    if (session?.user) {
      startAutoSync();
      // Initial sync on app start
      useAuthStore.getState().syncData();
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange((_event, session) => {
      useAuthStore.setState({
        session,
        user: session?.user ?? null,
      });

      // Start/stop auto-sync based on auth state
      if (session?.user) {
        startAutoSync();
      } else {
        stopAutoSync();
      }
    });

    // Sync when app becomes visible (user returns to tab)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const { user } = useAuthStore.getState();
        if (user) {
          useAuthStore.getState().syncData();
        }
      }
    });

    // Sync when coming back online
    window.addEventListener('online', () => {
      const { user } = useAuthStore.getState();
      if (user) {
        useAuthStore.getState().syncData();
      }
    });

  } catch {
    useAuthStore.getState().setLoading(false);
  }
}

// Start periodic auto-sync
function startAutoSync() {
  if (autoSyncTimer) return; // Already running

  autoSyncTimer = setInterval(() => {
    const { user, isSyncing } = useAuthStore.getState();
    if (user && !isSyncing) {
      useAuthStore.getState().syncData();
    }
  }, AUTO_SYNC_INTERVAL);
}

// Stop auto-sync
function stopAutoSync() {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }
}

// Trigger sync after local data changes (call this from hooks/components)
export function triggerSync() {
  const { user, isSyncing } = useAuthStore.getState();
  if (user && !isSyncing) {
    // Debounce: wait a bit before syncing to batch rapid changes
    setTimeout(() => {
      useAuthStore.getState().syncData();
    }, 1000);
  }
}
