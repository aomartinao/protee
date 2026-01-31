import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { subDays, format } from 'date-fns';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { FoodCard } from '@/components/chat/FoodCard';
import { LoggedFoodCard } from '@/components/chat/LoggedFoodCard';
import { QuickReplies } from '@/components/chat/QuickReplies';
import { ChatInput } from '@/components/chat/ChatInput';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useSettings, useRecentEntries } from '@/hooks/useProteinData';
import { useProgressInsights } from '@/hooks/useProgressInsights';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { getNickname } from '@/lib/nicknames';
import { addFoodEntry, deleteFoodEntryBySyncId, cleanupOldChatMessages, updateFoodEntry } from '@/db';
import { triggerSync } from '@/store/useAuthStore';
import { getToday, calculateMPSHits } from '@/lib/utils';
import { refineAnalysis } from '@/services/ai/client';
import {
  processUnifiedMessage,
  generateSmartGreeting,
  type UnifiedContext,
  type UnifiedMessage,
  type FoodAnalysis,
} from '@/services/ai/unified';
import type { DietaryPreferences, FoodEntry } from '@/types';

interface PendingFood {
  messageSyncId: string;
  analysis: FoodAnalysis;
  imageData?: string;
}

// Show messages from the last week, auto-cleanup older ones
const CHAT_HISTORY_DAYS = 7;

export function UnifiedChat() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { settings, settingsLoaded } = useSettings();
  const { user } = useAuthStore();
  const insights = useProgressInsights();
  const nickname = getNickname(user?.email);

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
  const [editName, setEditName] = useState('');
  const [editProtein, setEditProtein] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editRefinement, setEditRefinement] = useState('');
  const [isRefining, setIsRefining] = useState(false);

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

    await addFoodEntry(foodEntry);

    // Store full food entry on the message (for display in chat)
    updateMessage(messageSyncId, {
      foodEntrySyncId,
      foodEntry,
    });

    // Add learned preference (favorite)
    await learnPreference(analysis.foodName, 'favorite');

    triggerSync();
    setPendingFood(null);
    setShowQuickReplies([]);
  };

  // Edit food entry
  const handleEditFood = () => {
    // For now, just allow re-stating - could open edit dialog
    setPendingFood(null);
    addMessage({
      syncId: crypto.randomUUID(),
      type: 'assistant',
      content: 'No problem - tell me what to change.',
      timestamp: new Date(),
    });
  };

  // Cancel food entry
  const handleCancelFood = () => {
    setPendingFood(null);
    setShowQuickReplies([]);
  };

  // Learn user preference from confirmed meals
  const learnPreference = async (_foodName: string, _type: 'favorite' | 'dislike') => {
    // TODO: Implement preference learning
    // For now, just a placeholder - will store learned preferences in settings
  };

  const handleQuickReply = (reply: string) => {
    handleSendText(reply);
  };

  // Handle edit click on logged food card
  const handleEditLoggedFood = (entry: FoodEntry) => {
    setEditingEntry(entry);
    setEditName(entry.foodName);
    setEditProtein(entry.protein.toString());
    setEditCalories(entry.calories?.toString() || '');
    setEditDate(entry.date);
    const timeSource = entry.consumedAt || entry.createdAt;
    setEditTime(format(timeSource, 'HH:mm'));
  };

  // Save edited food entry
  const handleSaveEdit = async () => {
    if (!editingEntry?.id) return;

    let consumedAt: Date | undefined;
    if (editDate && editTime) {
      const [year, month, day] = editDate.split('-').map(Number);
      const [hours, minutes] = editTime.split(':').map(Number);
      consumedAt = new Date(year, month - 1, day, hours, minutes);
    }

    const updates: Partial<FoodEntry> = {
      foodName: editName,
      protein: parseInt(editProtein, 10) || 0,
      calories: editCalories ? parseInt(editCalories, 10) : undefined,
      date: editDate || editingEntry.date,
      consumedAt,
      updatedAt: new Date(),
    };

    await updateFoodEntry(editingEntry.id, updates);
    triggerSync();
    setEditingEntry(null);
    setEditRefinement('');
  };

  // AI refinement for edit
  const handleRefineEdit = async () => {
    const hasApiAccess = settings.claudeApiKey || settings.hasAdminApiKey;
    const useProxy = !settings.claudeApiKey && settings.hasAdminApiKey;

    if (!editRefinement.trim() || !hasApiAccess) return;

    setIsRefining(true);
    try {
      const originalAnalysis = {
        foodName: editName,
        protein: parseInt(editProtein, 10) || 0,
        calories: editCalories ? parseInt(editCalories, 10) : 0,
        confidence: editingEntry?.confidence || ('medium' as const),
        consumedAt: editDate && editTime
          ? { parsedDate: editDate, parsedTime: editTime }
          : undefined,
      };

      const result = await refineAnalysis(settings.claudeApiKey || null, originalAnalysis, editRefinement, useProxy);

      setEditName(result.foodName);
      setEditProtein(result.protein.toString());
      if (result.calories !== undefined) {
        setEditCalories(result.calories.toString());
      }
      if (result.consumedAt) {
        setEditDate(result.consumedAt.parsedDate);
        setEditTime(result.consumedAt.parsedTime);
      }

      setEditRefinement('');
    } catch (error) {
      console.error('Refinement failed:', error);
    } finally {
      setIsRefining(false);
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
                onEdit={handleEditFood}
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

      {/* Input */}
      <ChatInput
        onSendText={handleSendText}
        onSendImage={handleSendImage}
        disabled={isProcessing}
      />

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Food Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Protein (g)</label>
                <Input
                  type="number"
                  value={editProtein}
                  onChange={(e) => setEditProtein(e.target.value)}
                  min={0}
                  max={500}
                  className="h-11"
                />
              </div>
              {settings.calorieTrackingEnabled && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Calories</label>
                  <Input
                    type="number"
                    value={editCalories}
                    onChange={(e) => setEditCalories(e.target.value)}
                    min={0}
                    max={10000}
                    className="h-11"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Time</label>
                <Input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>

            {/* AI Refinement Section */}
            {(settings.claudeApiKey || settings.hasAdminApiKey) && (
              <div className="pt-4 border-t space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  Or describe what changed
                </label>
                <div className="flex gap-2">
                  <Input
                    value={editRefinement}
                    onChange={(e) => setEditRefinement(e.target.value)}
                    placeholder="e.g., it was 200g not 100g..."
                    disabled={isRefining}
                    className="h-11"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleRefineEdit();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-11 w-11"
                    onClick={handleRefineEdit}
                    disabled={!editRefinement.trim() || isRefining}
                  >
                    {isRefining ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => { setEditingEntry(null); setEditRefinement(''); }}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
