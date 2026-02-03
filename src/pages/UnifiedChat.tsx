import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { subDays, format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { FoodCard } from '@/components/chat/FoodCard';
import { LoggedFoodCard } from '@/components/chat/LoggedFoodCard';
import { QuickReplies } from '@/components/chat/QuickReplies';
import { QuickLogShortcuts } from '@/components/chat/QuickLogShortcuts';
import { FoodEntryEditDialog } from '@/components/FoodEntryEditDialog';
import { ChatInput } from '@/components/chat/ChatInput';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { ToastAction } from '@/components/ui/toast';
import { useSettings, useRecentEntries } from '@/hooks/useProteinData';
import { useProgressInsights } from '@/hooks/useProgressInsights';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { getNickname } from '@/lib/nicknames';
import { addFoodEntry, deleteFoodEntryBySyncId, cleanupOldChatMessages, updateFoodEntry, getEntriesForDateRange, hardDeleteFoodEntry, type FrequentMeal } from '@/db';
import { triggerSync } from '@/store/useAuthStore';
import { getToday, calculateMPSHits, triggerHaptic } from '@/lib/utils';
import { refineAnalysis } from '@/services/ai/client';
import {
  processUnifiedMessage,
  generateSmartGreeting,
  type UnifiedContext,
  type UnifiedMessage,
  type FoodAnalysis,
} from '@/services/ai/unified';
import type { DietaryPreferences, FoodEntry, ConfidenceLevel } from '@/types';

interface PendingFood {
  messageSyncId: string;
  analysis: FoodAnalysis;
  imageData?: string;
}

// Show messages from the last week, auto-cleanup older ones
const CHAT_HISTORY_DAYS = 7;

export function UnifiedChat() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { settings, settingsLoaded, updateSettings } = useSettings();
  const { user } = useAuthStore();
  const insights = useProgressInsights();
  const nickname = getNickname(user?.email);
  const { toast } = useToast();

  // Get food entries from recent days to build lookup map
  const recentEntries = useRecentEntries(CHAT_HISTORY_DAYS);

  // Build lookup map of entries by syncId (for messages that only have foodEntrySyncId)
  const entriesBySyncId = useMemo(() => {
    const map = new Map<string, FoodEntry>();
    for (const entry of recentEntries) {
      if (entry.syncId) {
        map.set(entry.syncId, entry);
      }
    }
    return map;
  }, [recentEntries]);

  // Calculate which entries are MPS hits (today only)
  const todayEntries = recentEntries.filter(e => e.date === getToday());
  const mpsHitSyncIds = useMemo(() => {
    const hits = calculateMPSHits(todayEntries);
    return new Set(hits.map(h => h.syncId).filter(Boolean));
  }, [todayEntries]);

  const {
    messages: allMessages,
    messagesLoaded,
    addMessage,
    updateMessage,
    loadMessages,
    pendingImageFromHome,
    setPendingImageFromHome,
  } = useStore();

  // Filter messages to only show last N days
  const cutoffDate = subDays(new Date(), CHAT_HISTORY_DAYS);
  const messages = useMemo(() => {
    return allMessages.filter(m => new Date(m.timestamp) >= cutoffDate);
  }, [allMessages, cutoffDate]);

  const [chatHistory, setChatHistory] = useState<UnifiedMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState<string[]>([]);
  const [pendingFood, setPendingFood] = useState<PendingFood | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Edit dialog state
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);

  // Load messages on mount
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Cleanup old messages on mount (older than 1 week)
  useEffect(() => {
    cleanupOldChatMessages(CHAT_HISTORY_DAYS);
  }, []);

  // Build context for AI
  const getContext = useCallback((): UnifiedContext => {
    const prefs: DietaryPreferences = settings.dietaryPreferences || {
      allergies: [],
      intolerances: [],
      dietaryRestrictions: [],
      dislikes: [],
      favorites: [],
    };

    // Get recent meal names for context
    const recentMeals = messages
      .filter(m => m.foodEntry && m.foodEntrySyncId && !m.foodEntry.deletedAt)
      .slice(-5)
      .map(m => m.foodEntry?.foodName)
      .filter(Boolean) as string[];

    // Get the most recent logged (non-deleted) entry for correction detection
    const recentLoggedMessages = messages
      .filter(m => m.foodEntry && m.foodEntrySyncId && !m.foodEntry.deletedAt)
      .slice(-1);

    let lastLoggedEntry;
    if (recentLoggedMessages.length > 0) {
      const lastMsg = recentLoggedMessages[0];
      const entry = lastMsg.foodEntry!;
      const loggedAt = entry.createdAt ? new Date(entry.createdAt).getTime() : Date.now();
      const minutesAgo = Math.round((Date.now() - loggedAt) / 60000);

      lastLoggedEntry = {
        syncId: entry.syncId!,
        foodName: entry.foodName,
        protein: entry.protein,
        calories: entry.calories,
        loggedMinutesAgo: minutesAgo,
      };
    }

    return {
      goal: settings.defaultGoal,
      consumed: insights.todayProtein,
      remaining: insights.remaining,
      currentTime: new Date(),
      sleepTime: prefs.sleepTime,
      preferences: prefs,
      nickname,
      insights,
      recentMeals,
      lastLoggedEntry,
    };
  }, [settings, insights, nickname, messages]);

  // Track if we've waited for insights to load
  const [insightsReady, setInsightsReady] = useState(false);

  // Wait a moment for insights to load before generating greeting
  useEffect(() => {
    if (!settingsLoaded || !messagesLoaded) return;
    if (insightsReady) return;

    // Small delay to let IndexedDB data load into insights
    const timer = setTimeout(() => {
      setInsightsReady(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [settingsLoaded, messagesLoaded, insightsReady]);

  // Initialize with smart greeting once insights are ready
  useEffect(() => {
    if (!insightsReady || initialized) return;
    setInitialized(true);

    // Only show greeting if no recent messages (within last hour) AND no pending image
    const recentMessage = messages[messages.length - 1];
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (recentMessage && new Date(recentMessage.timestamp).getTime() > oneHourAgo) {
      return; // Skip greeting, user has recent activity
    }
    if (pendingImageFromHome) {
      return; // Skip greeting, user is sending an image
    }

    const context = getContext();
    const greeting = generateSmartGreeting(context);

    addMessage({
      syncId: crypto.randomUUID(),
      type: 'assistant',
      content: greeting.message,
      timestamp: new Date(),
    });

    if (greeting.quickReplies) {
      setShowQuickReplies(greeting.quickReplies);
    }
  }, [insightsReady, initialized, getContext, addMessage, messages, pendingImageFromHome]);

  // Track if initial scroll has happened
  const hasScrolledRef = useRef(false);

  const scrollToBottom = useCallback((instant = false) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: instant ? 'instant' : 'smooth'
    });
  }, []);

  // Scroll on messages change - instant on first load, smooth after
  useEffect(() => {
    if (!messagesLoaded) return;

    const isInitialScroll = !hasScrolledRef.current;
    if (isInitialScroll) {
      hasScrolledRef.current = true;
    }
    scrollToBottom(isInitialScroll);
  }, [messages, pendingFood, messagesLoaded, scrollToBottom]);

  // Handle sending text
  const handleSendText = async (text: string) => {
    setShowQuickReplies([]);
    setPendingFood(null);

    const userSyncId = crypto.randomUUID();
    addMessage({
      syncId: userSyncId,
      type: 'user',
      content: text,
      timestamp: new Date(),
    });

    await processInput(text, null);
  };

  // Handle sending image
  const handleSendImage = async (imageData: string) => {
    setShowQuickReplies([]);
    setPendingFood(null);

    const userSyncId = crypto.randomUUID();
    addMessage({
      syncId: userSyncId,
      type: 'user',
      content: '',
      imageData,
      timestamp: new Date(),
    });

    await processInput('', imageData);
  };

  // Handle pending image from home screen (quick capture via long-press)
  useEffect(() => {
    if (!insightsReady || !initialized || !pendingImageFromHome) return;

    // Consume the pending image
    const imageData = pendingImageFromHome;
    setPendingImageFromHome(null, null);

    // Send the image
    handleSendImage(imageData);
  }, [insightsReady, initialized, pendingImageFromHome, setPendingImageFromHome, handleSendImage]);

  // Process input through unified AI
  const processInput = async (text: string, imageData: string | null) => {
    const hasApiAccess = settings.claudeApiKey || settings.hasAdminApiKey;
    const useProxy = !settings.claudeApiKey && settings.hasAdminApiKey;

    if (!hasApiAccess) {
      addMessage({
        syncId: crypto.randomUUID(),
        type: 'system',
        content: 'Add your Claude API key in Settings to use this feature.',
        timestamp: new Date(),
      });
      return;
    }

    const loadingSyncId = crypto.randomUUID();
    addMessage({
      syncId: loadingSyncId,
      type: 'assistant',
      content: '',
      isLoading: true,
      timestamp: new Date(),
    });

    setIsProcessing(true);

    try {
      const context = getContext();
      const result = await processUnifiedMessage(
        settings.claudeApiKey || null,
        text,
        imageData,
        context,
        chatHistory,
        useProxy
      );

      // Update chat history
      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: text || '[image]', imageData: imageData || undefined },
        { role: 'assistant', content: result.message },
      ]);

      // Handle food correction intent
      if (result.intent === 'correct_food' && result.foodAnalysis && result.correctsPreviousEntry) {
        const ctx = context; // context from getContext() above

        // Cancel the previous entry
        if (ctx.lastLoggedEntry) {
          // Soft delete the previous entry in the database
          await deleteFoodEntryBySyncId(ctx.lastLoggedEntry.syncId);

          // Find the message with this entry and mark it as cancelled
          const prevMessage = messages.find(m => m.foodEntrySyncId === ctx.lastLoggedEntry!.syncId);
          if (prevMessage && prevMessage.foodEntry) {
            updateMessage(prevMessage.syncId, {
              foodEntry: {
                ...prevMessage.foodEntry,
                deletedAt: new Date(),
              },
            });
          }
        }

        updateMessage(loadingSyncId, {
          isLoading: false,
          content: result.message,
        });

        // Set pending food for confirmation (the corrected entry)
        setPendingFood({
          messageSyncId: loadingSyncId,
          analysis: result.foodAnalysis,
          imageData: imageData || undefined,
        });

        if (result.quickReplies) {
          setShowQuickReplies(result.quickReplies);
        }
      }
      // Handle food logging intent
      else if (result.intent === 'log_food' && result.foodAnalysis) {
        updateMessage(loadingSyncId, {
          isLoading: false,
          content: result.message,
        });

        // Set pending food for confirmation
        setPendingFood({
          messageSyncId: loadingSyncId,
          analysis: result.foodAnalysis,
          imageData: imageData || undefined,
        });

        if (result.quickReplies) {
          setShowQuickReplies(result.quickReplies);
        }
      }
      // Handle menu analysis
      else if (result.intent === 'analyze_menu' && result.menuRecommendations) {
        const menuMessage = formatMenuRecommendations(result.message, result.menuRecommendations);
        updateMessage(loadingSyncId, {
          isLoading: false,
          content: menuMessage,
        });

        if (result.quickReplies) {
          setShowQuickReplies(result.quickReplies);
        }
      }
      // Regular response
      else {
        updateMessage(loadingSyncId, {
          isLoading: false,
          content: result.message,
        });

        if (result.quickReplies) {
          setShowQuickReplies(result.quickReplies);
        }
      }

    } catch (error) {
      updateMessage(loadingSyncId, {
        isLoading: false,
        content: `Something went wrong. ${error instanceof Error ? error.message : 'Please try again.'}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Format menu recommendations as readable text
  const formatMenuRecommendations = (
    intro: string,
    recs: { name: string; protein: number; reason: string }[]
  ): string => {
    const items = recs.map((r, i) =>
      `${i + 1}. **${r.name}** (~${r.protein}g) - ${r.reason}`
    ).join('\n');
    return `${intro}\n\n${items}`;
  };

  // Confirm food entry
  const handleConfirmFood = async () => {
    if (!pendingFood) return;

    const { analysis, imageData, messageSyncId } = pendingFood;

    // Calculate consumedAt
    let consumedAt: Date | undefined;
    let entryDate = getToday();
    if (analysis.consumedAt) {
      const [year, month, day] = analysis.consumedAt.parsedDate.split('-').map(Number);
      const [hours, minutes] = analysis.consumedAt.parsedTime.split(':').map(Number);
      consumedAt = new Date(year, month - 1, day, hours, minutes);
      entryDate = analysis.consumedAt.parsedDate;
    }

    const foodEntrySyncId = crypto.randomUUID();
    const now = new Date();

    const foodEntry = {
      syncId: foodEntrySyncId,
      date: entryDate,
      source: (imageData ? 'photo' : 'text') as 'photo' | 'text',
      foodName: analysis.foodName,
      protein: analysis.protein,
      calories: analysis.calories,
      confidence: analysis.confidence,
      imageData,
      consumedAt: consumedAt || now,
      createdAt: now,
      updatedAt: now,
    };

    const entryId = await addFoodEntry(foodEntry);
    triggerHaptic('success');

    // Store full food entry on the message (for display in chat)
    updateMessage(messageSyncId, {
      foodEntrySyncId,
      foodEntry,
    });

    // Add learned preference (favorite)
    await learnPreference(analysis.foodName, 'favorite');

    triggerSync();

    // Store pending state for potential undo
    const previousPending = { ...pendingFood };

    setPendingFood(null);
    setShowQuickReplies([]);

    // Show undo toast
    toast({
      title: `Logged ${analysis.foodName}`,
      description: `+${analysis.protein}g protein`,
      variant: 'success',
      action: (
        <ToastAction
          altText="Undo"
          onClick={async () => {
            // Hard delete the entry (completely remove, not soft delete)
            await hardDeleteFoodEntry(entryId);

            // Remove foodEntry from message to hide LoggedFoodCard
            updateMessage(messageSyncId, {
              foodEntrySyncId: undefined,
              foodEntry: undefined,
            });

            // Restore pending state so user can re-confirm
            setPendingFood(previousPending);

            triggerSync();
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };

  // Save inline edit to pending food
  const handleSavePendingEdit = (updates: Partial<FoodEntry>) => {
    if (!pendingFood) return;

    // Update the pending food analysis with the edited values
    setPendingFood({
      ...pendingFood,
      analysis: {
        ...pendingFood.analysis,
        foodName: updates.foodName || pendingFood.analysis.foodName,
        protein: updates.protein ?? pendingFood.analysis.protein,
        calories: updates.calories ?? pendingFood.analysis.calories,
        consumedAt: updates.consumedAt
          ? {
              parsedDate: format(updates.consumedAt, 'yyyy-MM-dd'),
              parsedTime: format(updates.consumedAt, 'HH:mm'),
            }
          : pendingFood.analysis.consumedAt,
      },
    });
  };

  // Cancel food entry
  const handleCancelFood = () => {
    setPendingFood(null);
    setShowQuickReplies([]);
  };

  // Learn user preference from confirmed meals
  const learnPreference = async (foodName: string, _type: 'favorite' | 'dislike') => {
    // Normalize food name for comparison
    const normalizedName = foodName.toLowerCase().trim();

    // Get current preferences
    const prefs = settings.dietaryPreferences || {
      allergies: [],
      intolerances: [],
      dietaryRestrictions: [],
      dislikes: [],
      favorites: [],
    };

    // Skip if already in favorites
    if (prefs.favorites.some(f => f.toLowerCase() === normalizedName)) {
      return;
    }

    // Count occurrences in recent entries (last 30 days)
    const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');
    const recentFoodEntries = await getEntriesForDateRange(startDate, endDate);

    const count = recentFoodEntries.filter(e =>
      e.foodName.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(e.foodName.toLowerCase())
    ).length;

    // Threshold: 3+ confirmations → add to favorites
    if (count >= 3 && !prefs.favorites.includes(foodName)) {
      const newPrefs = {
        ...prefs,
        favorites: [...prefs.favorites, foodName],
      };
      await updateSettings({ dietaryPreferences: newPrefs });
    }
  };

  const handleQuickReply = (reply: string) => {
    handleSendText(reply);
  };

  // Handle quick log shortcut - directly create pending food without AI
  const handleQuickLog = (meal: FrequentMeal) => {
    // Create a user message for the quick log
    const userMessageSyncId = crypto.randomUUID();
    addMessage({
      syncId: userMessageSyncId,
      type: 'user',
      content: meal.foodName,
      timestamp: new Date(),
    });

    // Create assistant message acknowledging the quick log
    const assistantMessageSyncId = crypto.randomUUID();
    addMessage({
      syncId: assistantMessageSyncId,
      type: 'assistant',
      content: `Quick logging ${meal.foodName} - ${meal.protein}g protein. Confirm or edit below.`,
      timestamp: new Date(),
    });

    // Set pending food directly (no AI round-trip)
    setPendingFood({
      messageSyncId: assistantMessageSyncId,
      analysis: {
        foodName: meal.foodName,
        protein: meal.protein,
        calories: meal.calories,
        confidence: 'high' as const,
        consumedAt: {
          parsedDate: format(new Date(), 'yyyy-MM-dd'),
          parsedTime: format(new Date(), 'HH:mm'),
        },
      },
    });
  };

  // Handle edit click on logged food card
  const handleEditLoggedFood = (entry: FoodEntry) => {
    setEditingEntry(entry);
  };

  // Save edited food entry (callback for FoodEntryEditDialog)
  const handleSaveEdit = async (entryId: number, updates: Partial<FoodEntry>) => {
    await updateFoodEntry(entryId, updates);
    triggerSync();
    setEditingEntry(null);
  };

  // AI refinement for edit (callback for FoodEntryEditDialog)
  const handleRefineEdit = async (
    originalAnalysis: { foodName: string; protein: number; calories: number; confidence: ConfidenceLevel; consumedAt?: { parsedDate: string; parsedTime: string } },
    refinement: string
  ) => {
    const useProxy = !settings.claudeApiKey && settings.hasAdminApiKey;
    try {
      const result = await refineAnalysis(settings.claudeApiKey || null, originalAnalysis, refinement, useProxy);
      return {
        foodName: result.foodName,
        protein: result.protein,
        calories: result.calories,
      };
    } catch (error) {
      console.error('Refinement failed:', error);
      return null;
    }
  };

  // Delete logged food entry
  const handleDeleteLoggedFood = async (syncId: string) => {
    await deleteFoodEntryBySyncId(syncId);
    triggerSync();
  };

  // Loading state
  if (!settingsLoaded || !messagesLoaded) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Compact progress bar */}
      <div className="px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center justify-between text-sm">
          <div>
            <span className="font-semibold text-primary">{insights.todayProtein}g</span>
            <span className="text-muted-foreground"> / {settings.defaultGoal}g</span>
          </div>
          {insights.currentStreak > 0 && (
            <span className="text-orange-500 text-xs">🔥 {insights.currentStreak}d</span>
          )}
        </div>
        <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, insights.percentComplete)}%` }}
          />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 pb-2 min-h-0 scroll-smooth overscroll-contain">
        {messages.map((message, index) => {
          // Show LoggedFoodCard for messages with confirmed food entries
          // Check both message.foodEntry (new) and lookup by syncId (old messages)
          const foodEntry = message.foodEntry ||
            (message.foodEntrySyncId ? entriesBySyncId.get(message.foodEntrySyncId) : undefined);

          if (foodEntry && message.foodEntrySyncId && !foodEntry.deletedAt) {
            const isMPSHit = mpsHitSyncIds.has(message.foodEntrySyncId);
            const entrySyncId = message.foodEntrySyncId;
            return (
              <div key={message.syncId} className="mb-3">
                <SwipeableRow
                  itemName={foodEntry.foodName}
                  onEdit={() => handleEditLoggedFood(foodEntry)}
                  onDelete={() => handleDeleteLoggedFood(entrySyncId)}
                >
                  <LoggedFoodCard
                    entry={foodEntry}
                    showCalories={settings.calorieTrackingEnabled}
                    isMPSHit={isMPSHit}
                  />
                </SwipeableRow>
              </div>
            );
          }

          return (
            <MessageBubble
              key={message.syncId}
              message={message}
              isLatestMessage={index === messages.length - 1}
            />
          );
        })}

        {/* Pending food card */}
        {pendingFood && (() => {
          // Convert parsed time to Date if available
          let pendingConsumedAt: Date | undefined;
          if (pendingFood.analysis.consumedAt) {
            const { parsedDate, parsedTime } = pendingFood.analysis.consumedAt;
            const [year, month, day] = parsedDate.split('-').map(Number);
            const [hours, minutes] = parsedTime.split(':').map(Number);
            pendingConsumedAt = new Date(year, month - 1, day, hours, minutes);
          }
          return (
            <div className="mt-3 mb-2">
              <FoodCard
                entry={{
                  foodName: pendingFood.analysis.foodName,
                  protein: pendingFood.analysis.protein,
                  calories: pendingFood.analysis.calories,
                  confidence: pendingFood.analysis.confidence,
                  imageData: pendingFood.imageData,
                  consumedAt: pendingConsumedAt,
                } as FoodEntry}
                onConfirm={handleConfirmFood}
                onSaveEdit={handleSavePendingEdit}
                onCancel={handleCancelFood}
                showCalories={settings.calorieTrackingEnabled}
                isConfirmed={false}
              />
            </div>
          );
        })()}

        {/* Quick replies */}
        {showQuickReplies.length > 0 && !isProcessing && !pendingFood && (
          <div className="mt-3">
            <QuickReplies
              replies={showQuickReplies}
              onSelect={handleQuickReply}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Log Shortcuts */}
      {!pendingFood && !isProcessing && (
        <QuickLogShortcuts
          onSelect={handleQuickLog}
          disabled={isProcessing}
        />
      )}

      {/* Input */}
      <ChatInput
        onSendText={handleSendText}
        onSendImage={handleSendImage}
        disabled={isProcessing}
      />

      {/* Edit Dialog */}
      <FoodEntryEditDialog
        entry={editingEntry}
        open={!!editingEntry}
        onOpenChange={(open) => !open && setEditingEntry(null)}
        onSave={handleSaveEdit}
        onRefine={handleRefineEdit}
        showCalories={settings.calorieTrackingEnabled}
        hasAIAccess={!!(settings.claudeApiKey || settings.hasAdminApiKey)}
      />
    </div>
  );
}
