import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserSettings, ChatMessage, FoodEntry } from '@/types';
import {
  addChatMessage,
  getChatMessages,
  updateChatMessage as updateChatMessageDb,
} from '@/db';

interface AppState {
  // User Settings
  settings: UserSettings;
  setSettings: (settings: Partial<UserSettings>) => void;

  // Chat Messages (persisted to IndexedDB)
  messages: ChatMessage[];
  messagesLoaded: boolean;
  addMessage: (message: Omit<ChatMessage, 'id'>) => Promise<void>;
  updateMessage: (syncId: string, updates: Partial<ChatMessage>) => Promise<void>;
  clearMessages: () => void;
  loadMessages: () => Promise<void>;
  reloadMessages: () => Promise<void>;
  setMessages: (messages: ChatMessage[]) => void;

  // Pending Entry (food being confirmed)
  pendingEntry: Partial<FoodEntry> | null;
  setPendingEntry: (entry: Partial<FoodEntry> | null) => void;

  // UI State
  isAnalyzing: boolean;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
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
      setSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

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

      // Pending entry
      pendingEntry: null,
      setPendingEntry: (entry) => set({ pendingEntry: entry }),

      // UI state
      isAnalyzing: false,
      setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
    }),
    {
      name: 'protee-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
  )
);
