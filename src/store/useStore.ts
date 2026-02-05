import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserSettings, ChatMessage, FoodEntry } from '@/types';
import {
  addChatMessage,
  getChatMessages,
  updateChatMessage as updateChatMessageDb,
  getUserSettings,
} from '@/db';

interface AppState {
  // User Settings
  settings: UserSettings;
  settingsLoaded: boolean;
  setSettings: (settings: Partial<UserSettings>) => void;
  loadSettingsFromDb: () => Promise<void>;
  reloadSettings: () => Promise<void>;

  // Chat Messages (persisted to IndexedDB)
  messages: ChatMessage[];
  messagesLoaded: boolean;
  addMessage: (message: Omit<ChatMessage, 'id'>) => Promise<void>;
  updateMessage: (syncId: string, updates: Partial<ChatMessage>) => Promise<void>;
  clearMessages: () => void;
  loadMessages: () => Promise<void>;
  reloadMessages: () => Promise<void>;
  setMessages: (messages: ChatMessage[]) => void;

  // Advisor Messages (in-memory, survives navigation)
  advisorMessages: ChatMessage[];
  advisorInitialized: boolean;
  setAdvisorMessages: (messages: ChatMessage[]) => void;
  addAdvisorMessage: (message: ChatMessage) => void;
  updateAdvisorMessage: (syncId: string, updates: Partial<ChatMessage>) => void;
  setAdvisorInitialized: (initialized: boolean) => void;
  clearAdvisorMessages: () => void;

  // Pending Entry (food being confirmed)
  pendingEntry: Partial<FoodEntry> | null;
  setPendingEntry: (entry: Partial<FoodEntry> | null) => void;

  // Pending message tracking (for follow-up refinements)
  pendingMessageSyncId: string | null;
  setPendingMessageSyncId: (syncId: string | null) => void;

  // UI State
  isAnalyzing: boolean;
  setIsAnalyzing: (isAnalyzing: boolean) => void;

  // Dashboard state (for header "Today" button)
  dashboardShowTodayButton: boolean;
  dashboardOnToday: (() => void) | null;
  setDashboardState: (showToday: boolean, onToday: (() => void) | null) => void;

  // Floating action button state
  showFloatingAddButton: boolean;
  setShowFloatingAddButton: (show: boolean) => void;

  // Pending image from home screen (for quick capture)
  pendingImageFromHome: string | null;
  pendingImageSource: 'camera' | 'gallery' | null;
  setPendingImageFromHome: (imageData: string | null, source: 'camera' | 'gallery' | null) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Default settings
      settings: {
        defaultGoal: 150,
        calorieGoal: undefined,
        calorieTrackingEnabled: false,
        theme: 'system',
        claudeApiKey: undefined,
      },
      settingsLoaded: false,
      setSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      loadSettingsFromDb: async () => {
        if (get().settingsLoaded) return; // Already loaded
        try {
          const dbSettings = await getUserSettings();
          // Update settings and settingsLoaded atomically
          set({
            settings: dbSettings ? { ...get().settings, ...dbSettings } : get().settings,
            settingsLoaded: true,
          });
          console.log('[Store] Loaded settings from IndexedDB:', dbSettings);
        } catch (err) {
          console.error('[Store] Failed to load settings:', err);
          set({ settingsLoaded: true }); // Mark as loaded even on error
        }
      },

      reloadSettings: async () => {
        try {
          const dbSettings = await getUserSettings();
          if (dbSettings) {
            set({ settings: dbSettings, settingsLoaded: true });
            console.log('[Store] Reloaded settings from IndexedDB:', dbSettings);
          } else {
            console.log('[Store] No settings in IndexedDB to reload');
          }
        } catch (err) {
          console.error('[Store] Failed to reload settings:', err);
        }
      },

      // Chat messages
      messages: [],
      messagesLoaded: false,

      addMessage: async (message) => {
        const messageWithSync = {
          ...message,
          syncId: message.syncId || crypto.randomUUID(),
          updatedAt: new Date(),
        };

        // Add to state immediately for responsiveness
        set((state) => ({
          messages: [...state.messages, messageWithSync as ChatMessage],
        }));

        // Persist to IndexedDB (don't persist imageData in messages - it's in food entries)
        const messageToStore = {
          ...messageWithSync,
          // Keep imageData for user messages so they can see their photos
          // But don't store it for assistant messages (it's in foodEntry.imageData)
        };

        try {
          const id = await addChatMessage(messageToStore);
          // Update the message in state with the DB id
          set((state) => ({
            messages: state.messages.map((m) =>
              m.syncId === messageWithSync.syncId ? { ...m, id } : m
            ),
          }));
        } catch (err) {
          console.error('[Store] Failed to persist message:', err);
        }
      },

      updateMessage: async (syncId, updates) => {
        // Update in state
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.syncId === syncId ? { ...msg, ...updates, updatedAt: new Date() } : msg
          ),
        }));

        // Find the message to get its DB id
        const message = get().messages.find((m) => m.syncId === syncId);
        if (message?.id) {
          try {
            await updateChatMessageDb(message.id, updates);
          } catch (err) {
            console.error('[Store] Failed to update message in DB:', err);
          }
        }
      },

      clearMessages: () => set({ messages: [] }),

      loadMessages: async () => {
        if (get().messagesLoaded) return;

        try {
          const messages = await getChatMessages(200);
          set({ messages, messagesLoaded: true });
          console.log('[Store] Loaded', messages.length, 'messages from IndexedDB');
        } catch (err) {
          console.error('[Store] Failed to load messages:', err);
          set({ messagesLoaded: true }); // Mark as loaded even on error to prevent retry loops
        }
      },

      reloadMessages: async () => {
        try {
          const messages = await getChatMessages(200);
          set({ messages, messagesLoaded: true });
          console.log('[Store] Reloaded', messages.length, 'messages from IndexedDB');
        } catch (err) {
          console.error('[Store] Failed to reload messages:', err);
        }
      },

      setMessages: (messages) => set({ messages, messagesLoaded: true }),

      // Advisor messages (in-memory)
      advisorMessages: [],
      advisorInitialized: false,
      setAdvisorMessages: (advisorMessages) => set({ advisorMessages }),
      addAdvisorMessage: (message) =>
        set((state) => ({
          advisorMessages: [...state.advisorMessages, message],
        })),
      updateAdvisorMessage: (syncId, updates) =>
        set((state) => ({
          advisorMessages: state.advisorMessages.map((msg) =>
            msg.syncId === syncId ? { ...msg, ...updates } : msg
          ),
        })),
      setAdvisorInitialized: (advisorInitialized) => set({ advisorInitialized }),
      clearAdvisorMessages: () => set({ advisorMessages: [], advisorInitialized: false }),

      // Pending entry
      pendingEntry: null,
      setPendingEntry: (entry) => set({ pendingEntry: entry }),

      // Pending message tracking
      pendingMessageSyncId: null,
      setPendingMessageSyncId: (syncId) => set({ pendingMessageSyncId: syncId }),

      // UI state
      isAnalyzing: false,
      setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),

      // Dashboard state
      dashboardShowTodayButton: false,
      dashboardOnToday: null,
      setDashboardState: (showToday, onToday) => set({
        dashboardShowTodayButton: showToday,
        dashboardOnToday: onToday
      }),

      // Floating action button
      showFloatingAddButton: false,
      setShowFloatingAddButton: (show) => set({ showFloatingAddButton: show }),

      // Pending image from home screen
      pendingImageFromHome: null,
      pendingImageSource: null,
      setPendingImageFromHome: (imageData, source) => set({
        pendingImageFromHome: imageData,
        pendingImageSource: source
      }),
    }),
    {
      name: 'protee-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: {
          ...state.settings,
          claudeApiKey: undefined, // Never persist API key to localStorage (security)
        },
      }),
    }
  )
);
