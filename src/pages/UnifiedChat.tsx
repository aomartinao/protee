import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { subDays, format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { FoodCard } from '@/components/chat/FoodCard';
import { LoggedFoodCard } from '@/components/chat/LoggedFoodCard';
import { SleepLogCard } from '@/components/chat/SleepLogCard';
import { TrainingLogCard } from '@/components/chat/TrainingLogCard';
import { QuickReplies } from '@/components/chat/QuickReplies';
import { QuickLogShortcuts } from '@/components/chat/QuickLogShortcuts';
import { FoodEntryEditDialog } from '@/components/FoodEntryEditDialog';
import { ChatInput } from '@/components/chat/ChatInput';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { useSettings, useRecentEntries, useRecentEntriesIncludingDeleted } from '@/hooks/useProteinData';
import { useProgressInsights } from '@/hooks/useProgressInsights';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { getNickname } from '@/lib/nicknames';
import {
  addFoodEntry, deleteFoodEntryBySyncId, cleanupOldChatMessages, updateFoodEntry,
  getEntriesForDateRange, setDailyGoal,
  addSleepEntry, getSleepAverageForDays, getLastSleepEntry,
  addTrainingEntry, getTrainingSessions7Days, getDaysSinceLastTraining,
} from '@/db';
import { triggerSync } from '@/store/useAuthStore';
import { getToday, calculateMPSHits, calculateMPSAnalysis, calculateCategoryBreakdown, triggerHaptic } from '@/lib/utils';
import { refineAnalysis } from '@/services/ai/client';
import {
  processUnifiedMessage,
  generateSmartGreeting,
  type UnifiedContext,
  type UnifiedMessage,
  type FoodAnalysis,
  type SleepAnalysis,
  type TrainingAnalysis,
  type SleepContext,
  type TrainingContext,
} from '@/services/ai/unified';
import type { DietaryPreferences, FoodEntry, ConfidenceLevel } from '@/types';

interface PendingFood {
  messageSyncId: string;
  analysis: FoodAnalysis;
  imageData?: string;
}

interface PendingSleep {
  messageSyncId: string;
  analysis: SleepAnalysis;
}

interface PendingTraining {
  messageSyncId: string;
  analysis: TrainingAnalysis;
}

// Chat history retention settings
const CHAT_HISTORY_DAYS = 14;  // Display window: 2 weeks for weekly wrap-ups
const CHAT_CLEANUP_DAYS = 21;  // Local cleanup: 3 weeks (buffer for offline use)

export function UnifiedChat() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { settings, settingsLoaded, updateSettings } = useSettings();
  const { user } = useAuthStore();
  const insights = useProgressInsights();
  const nickname = getNickname(user?.email);

  // Get food entries from recent days - two separate hooks:
  // 1. Including deleted for lookup map (to show cancelled state)
  // 2. Excluding deleted for MPS calculation
  const allRecentEntries = useRecentEntriesIncludingDeleted(CHAT_HISTORY_DAYS);
  const activeRecentEntries = useRecentEntries(CHAT_HISTORY_DAYS);

  // Build lookup map of entries by syncId (includes deleted entries for cancelled state)
  const entriesBySyncId = useMemo(() => {
    const map = new Map<string, FoodEntry>();
    for (const entry of allRecentEntries) {
      if (entry.syncId) {
        map.set(entry.syncId, entry);
      }
    }
    return map;
  }, [allRecentEntries]);

  // Calculate which entries are MPS hits (today only, excludes deleted)
  const todayEntries = activeRecentEntries.filter(e => e.date === getToday());
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
  const [pendingSleep, setPendingSleep] = useState<PendingSleep | null>(null);
  const [pendingTraining, setPendingTraining] = useState<PendingTraining | null>(null);
  const [sleepContext, setSleepContext] = useState<SleepContext | null>(null);
  const [trainingContext, setTrainingContext] = useState<TrainingContext | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Edit dialog state
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);

  // Input focus state for showing quick log suggestions
  const [showQuickLogSuggestions, setShowQuickLogSuggestions] = useState(false);

  // Pre-fill text state for quick log shortcuts
  const [prefillText, setPrefillText] = useState<string | null>(null);

  // Progress feedback state (shows +Xg animation on confirm)
  const [progressFeedback, setProgressFeedback] = useState<number | null>(null);

  // Smart scroll state
  const [showNewMessagePill, setShowNewMessagePill] = useState(false);
  const isAtBottomRef = useRef(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Load messages on mount
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Cleanup old messages (throttled to once per day)
  useEffect(() => {
    const lastCleanup = localStorage.getItem('lastChatCleanup');
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    if (!lastCleanup || parseInt(lastCleanup) < oneDayAgo) {
      cleanupOldChatMessages(CHAT_CLEANUP_DAYS);
      localStorage.setItem('lastChatCleanup', Date.now().toString());
    }
  }, []);

  // Load sleep & training context on mount
  useEffect(() => {
    if (!settingsLoaded) return;

    async function loadSleepTrainingContext() {
      // Sleep context
      if (settings.sleepTrackingEnabled) {
        const [avg7, lastEntry] = await Promise.all([
          getSleepAverageForDays(7),
          getLastSleepEntry(),
        ]);
        setSleepContext({
          sleepLastNight: lastEntry?.date === getToday() ? lastEntry.duration : undefined,
          sleepAvg7Days: avg7 || undefined,
          sleepGoal: settings.sleepGoalMinutes,
        });
      }

      // Training context
      if (settings.trainingTrackingEnabled) {
        const [sessions, daysSince] = await Promise.all([
          getTrainingSessions7Days(),
          getDaysSinceLastTraining(),
        ]);
        setTrainingContext({
          trainingSessions7Days: sessions.length,
          trainingGoalPerWeek: settings.trainingGoalPerWeek,
          daysSinceLastTraining: daysSince ?? undefined,
          lastMuscleGroup: sessions[0]?.muscleGroup,
        });
      }
    }

    loadSleepTrainingContext();
  }, [settingsLoaded, settings.sleepTrackingEnabled, settings.trainingTrackingEnabled, settings.sleepGoalMinutes, settings.trainingGoalPerWeek]);

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

    // Calculate MPS analysis for coaching triggers
    const mpsAnalysis = calculateMPSAnalysis(todayEntries);

    // Calculate protein by category for variety nudges
    const todayByCategory = calculateCategoryBreakdown(todayEntries);

    // Determine if preferences came from settings or conversation
    const hasPreferences = prefs.allergies?.length ||
      prefs.intolerances?.length ||
      prefs.dietaryRestrictions?.length ||
      prefs.sleepTime;
    const preferencesSource = hasPreferences ? 'settings' : 'none';

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
      mpsAnalysis,
      todayByCategory,
      preferencesSource,
      sleepContext: sleepContext ?? undefined,
      trainingContext: trainingContext ?? undefined,
    };
  }, [settings, insights, nickname, messages, todayEntries, sleepContext, trainingContext]);

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
    setShowNewMessagePill(false);
  }, []);

  // Check if scroll is at bottom (with small threshold)
  const checkIfAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const threshold = 100; // px from bottom to consider "at bottom"
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Handle scroll events to track position
  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom();
    isAtBottomRef.current = atBottom;
    if (atBottom) {
      setShowNewMessagePill(false);
    }
  }, [checkIfAtBottom]);

  // Scroll on messages change - instant on first load, smart after
  useEffect(() => {
    if (!messagesLoaded) return;

    const isInitialScroll = !hasScrolledRef.current;
    if (isInitialScroll) {
      hasScrolledRef.current = true;
      scrollToBottom(true);
      return;
    }

    // Smart scroll: only scroll if user is at bottom, otherwise show pill
    if (isAtBottomRef.current) {
      scrollToBottom(false);
    } else {
      setShowNewMessagePill(true);
    }
  }, [messages, pendingFood, pendingSleep, pendingTraining, messagesLoaded, scrollToBottom]);

  // Handle sending message (text and/or images)
  const handleSend = async (text: string, images: string[]) => {
    setShowQuickReplies([]);
    setPendingFood(null);
    setPendingSleep(null);
    setPendingTraining(null);

    const userSyncId = crypto.randomUUID();
    addMessage({
      syncId: userSyncId,
      type: 'user',
      content: text,
      images: images.length > 0 ? images : undefined,
      timestamp: new Date(),
    });

    await processInput(text, images);
  };

  // Handle consuming external image after it's added to ChatInput
  const handleExternalImageConsumed = useCallback(() => {
    setPendingImageFromHome(null, null);
  }, [setPendingImageFromHome]);

  // Process input through unified AI
  const processInput = async (text: string, images: string[]) => {
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
    const hasImages = images.length > 0;
    addMessage({
      syncId: loadingSyncId,
      type: 'assistant',
      content: '',
      isLoading: true,
      isAnalyzingImage: hasImages,
      timestamp: new Date(),
    });

    setIsProcessing(true);

    try {
      const context = getContext();
      const result = await processUnifiedMessage(
        settings.claudeApiKey || null,
        text,
        images,
        context,
        chatHistory,
        useProxy
      );

      // Update chat history
      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: text || '[image]', imageData: images[0] || undefined },
        { role: 'assistant', content: result.message },
      ]);

      // Build display message: acknowledgment + coaching (if present)
      const buildDisplayMessage = (ack: string, coaching?: { message: string }) => {
        if (coaching?.message) {
          return `${ack}\n\n${coaching.message}`;
        }
        return ack;
      };

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
          content: buildDisplayMessage(result.acknowledgment || result.message, result.coaching),
        });

        // Set pending food for confirmation (the corrected entry)
        setPendingFood({
          messageSyncId: loadingSyncId,
          analysis: result.foodAnalysis,
          imageData: images[0] || undefined,
        });

        if (result.quickReplies) {
          setShowQuickReplies(result.quickReplies);
        }
      }
      // Handle food logging intent
      else if (result.intent === 'log_food' && result.foodAnalysis) {
        updateMessage(loadingSyncId, {
          isLoading: false,
          content: buildDisplayMessage(result.acknowledgment || result.message, result.coaching),
        });

        // Set pending food for confirmation
        setPendingFood({
          messageSyncId: loadingSyncId,
          analysis: result.foodAnalysis,
          imageData: images[0] || undefined,
        });

        if (result.quickReplies) {
          setShowQuickReplies(result.quickReplies);
        }
      }
      // Handle sleep logging intent
      else if (result.intent === 'log_sleep' && result.sleepAnalysis) {
        updateMessage(loadingSyncId, {
          isLoading: false,
          content: buildDisplayMessage(result.acknowledgment || result.message, result.coaching),
        });

        setPendingSleep({
          messageSyncId: loadingSyncId,
          analysis: result.sleepAnalysis,
        });

        if (result.quickReplies) {
          setShowQuickReplies(result.quickReplies);
        }
      }
      // Handle training logging intent
      else if (result.intent === 'log_training' && result.trainingAnalysis) {
        updateMessage(loadingSyncId, {
          isLoading: false,
          content: buildDisplayMessage(result.acknowledgment || result.message, result.coaching),
        });

        setPendingTraining({
          messageSyncId: loadingSyncId,
          analysis: result.trainingAnalysis,
        });

        if (result.quickReplies) {
          setShowQuickReplies(result.quickReplies);
        }
      }
      // Handle menu analysis
      else if (result.intent === 'analyze_menu' && result.menuPicks) {
        const menuMessage = formatMenuRecommendations(
          result.acknowledgment || result.message,
          result.menuPicks.map(p => ({ name: p.name, protein: p.protein, reason: p.why }))
        );
        const fullMessage = result.coaching?.message
          ? `${menuMessage}\n\n${result.coaching.message}`
          : menuMessage;
        updateMessage(loadingSyncId, {
          isLoading: false,
          content: fullMessage,
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
        isError: true,
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
    if (analysis.consumedAt?.parsedDate && analysis.consumedAt?.parsedTime) {
      const [year, month, day] = analysis.consumedAt.parsedDate.split('-').map(Number);
      const [hours, minutes] = analysis.consumedAt.parsedTime.split(':').map(Number);
      const parsedDate = new Date(year, month - 1, day, hours, minutes);

      // Validate the date is reasonable (within last 2 days) - AI sometimes hallucinates dates
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      if (parsedDate >= twoDaysAgo && parsedDate <= now) {
        consumedAt = parsedDate;
        entryDate = analysis.consumedAt.parsedDate;
      } else {
        // Use today's date with the parsed time
        consumedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
      }
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

    // Save the current goal for this day (updates on every entry to capture goal changes)
    await setDailyGoal(entryDate, settings.defaultGoal, settings.calorieGoal);

    triggerHaptic('success');

    // Show progress feedback animation
    setProgressFeedback(analysis.protein);
    setTimeout(() => setProgressFeedback(null), 2000);

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

  // Confirm sleep entry
  const handleConfirmSleep = async () => {
    if (!pendingSleep) return;

    const { analysis } = pendingSleep;
    const now = new Date();

    await addSleepEntry({
      date: getToday(),
      duration: analysis.duration,
      bedtime: analysis.bedtime,
      wakeTime: analysis.wakeTime,
      quality: analysis.quality,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    });

    triggerHaptic('success');
    triggerSync();

    // Refresh sleep context
    const [avg7, lastEntry] = await Promise.all([
      getSleepAverageForDays(7),
      getLastSleepEntry(),
    ]);
    setSleepContext({
      sleepLastNight: lastEntry?.date === getToday() ? lastEntry.duration : undefined,
      sleepAvg7Days: avg7 || undefined,
      sleepGoal: settings.sleepGoalMinutes,
    });

    setPendingSleep(null);
    setShowQuickReplies([]);
  };

  // Cancel sleep entry
  const handleCancelSleep = () => {
    setPendingSleep(null);
    setShowQuickReplies([]);
  };

  // Confirm training entry
  const handleConfirmTraining = async () => {
    if (!pendingTraining) return;

    const { analysis } = pendingTraining;
    const now = new Date();

    await addTrainingEntry({
      date: getToday(),
      muscleGroup: analysis.muscleGroup,
      duration: analysis.duration,
      notes: analysis.notes,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    });

    triggerHaptic('success');
    triggerSync();

    // Refresh training context
    const [sessions, daysSince] = await Promise.all([
      getTrainingSessions7Days(),
      getDaysSinceLastTraining(),
    ]);
    setTrainingContext({
      trainingSessions7Days: sessions.length,
      trainingGoalPerWeek: settings.trainingGoalPerWeek,
      daysSinceLastTraining: daysSince ?? undefined,
      lastMuscleGroup: sessions[0]?.muscleGroup,
    });

    setPendingTraining(null);
    setShowQuickReplies([]);
  };

  // Cancel training entry
  const handleCancelTraining = () => {
    setPendingTraining(null);
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
    handleSend(reply, []);
  };

  // Handle quick log shortcut - pre-fill the input instead of direct logging
  const handleQuickLog = useCallback((prefillText: string) => {
    setPrefillText(prefillText);
    setShowQuickLogSuggestions(false);
  }, []);

  // Callback when prefill text is consumed by ChatInput
  const handlePrefillTextConsumed = useCallback(() => {
    setPrefillText(null);
  }, []);

  // Handle input focus change for quick log suggestions
  const handleInputFocusChange = useCallback((focused: boolean, hasText: boolean) => {
    // Show suggestions only when focused and input is empty
    setShowQuickLogSuggestions(focused && !hasText);
  }, []);

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
    // Soft delete in database
    await deleteFoodEntryBySyncId(syncId);

    // Update message to show cancelled state
    // Store deletedAt both on foodEntry AND as a separate flag to survive sync reloads
    const message = messages.find(m => m.foodEntrySyncId === syncId);
    if (message) {
      const deletedAt = new Date();
      updateMessage(message.syncId, {
        foodEntry: message.foodEntry ? {
          ...message.foodEntry,
          deletedAt,
        } : undefined,
        // Store cancelled state separately so it survives message reloads from cloud
        foodEntryDeletedAt: deletedAt,
      });
    }

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
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
      {/* Progress feedback floating indicator */}
      {progressFeedback !== null && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20">
          <span className="text-green-600 font-bold text-lg animate-in fade-in zoom-in slide-in-from-bottom-2 duration-300 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-lg">
            +{progressFeedback}g
          </span>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-2 min-h-0 scroll-smooth overscroll-contain relative"
      >
        {messages.map((message, index) => {
          // Check for confirmed food entry on this message
          const foodEntry = message.foodEntry ||
            (message.foodEntrySyncId ? entriesBySyncId.get(message.foodEntrySyncId) : undefined);
          // Check cancelled state from both foodEntry.deletedAt AND message.foodEntryDeletedAt (survives sync)
          const isCancelled = !!(foodEntry?.deletedAt || message.foodEntryDeletedAt);
          const hasConfirmedFood = !!(foodEntry && message.foodEntrySyncId && !isCancelled);
          const hasCancelledFood = !!(foodEntry && message.foodEntrySyncId && isCancelled);
          const isMPSHit = hasConfirmedFood && mpsHitSyncIds.has(message.foodEntrySyncId!);
          const entrySyncId = message.foodEntrySyncId;

          // Check if pending food belongs to this message
          const hasPendingFood = pendingFood && pendingFood.messageSyncId === message.syncId;

          // Calculate pending food consumed time
          let pendingConsumedAt: Date | undefined;
          if (hasPendingFood && pendingFood.analysis.consumedAt?.parsedDate && pendingFood.analysis.consumedAt?.parsedTime) {
            const { parsedDate, parsedTime } = pendingFood.analysis.consumedAt;
            const [year, month, day] = parsedDate.split('-').map(Number);
            const [hours, minutes] = parsedTime.split(':').map(Number);
            const parsed = new Date(year, month - 1, day, hours, minutes);

            const now = new Date();
            const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
            if (parsed >= twoDaysAgo && parsed <= now) {
              pendingConsumedAt = parsed;
            } else {
              pendingConsumedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
            }
          }

          return (
            <div key={message.syncId}>
              {/* Always render the message bubble */}
              <MessageBubble
                message={message}
                isLatestMessage={index === messages.length - 1 && !hasConfirmedFood && !hasPendingFood}
              />

              {/* Render LoggedFoodCard below the AI message that confirmed it */}
              {hasConfirmedFood && (
                <div className="mt-2 mb-3">
                  <SwipeableRow
                    itemName={foodEntry.foodName}
                    onEdit={() => handleEditLoggedFood(foodEntry)}
                    onDelete={() => handleDeleteLoggedFood(entrySyncId!)}
                  >
                    <LoggedFoodCard
                      entry={foodEntry}
                      showCalories={settings.calorieTrackingEnabled}
                      isMPSHit={isMPSHit}
                    />
                  </SwipeableRow>
                </div>
              )}

              {/* Render cancelled food card (non-interactive) */}
              {hasCancelledFood && (
                <div className="mt-2 mb-3">
                  <LoggedFoodCard
                    entry={foodEntry}
                    showCalories={settings.calorieTrackingEnabled}
                    isMPSHit={false}
                  />
                </div>
              )}

              {/* Render pending FoodCard below the AI message that analyzed it */}
              {hasPendingFood && (
                <div className="mt-2 mb-3">
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
              )}

              {/* Render pending SleepLogCard */}
              {pendingSleep && pendingSleep.messageSyncId === message.syncId && (
                <div className="mt-2 mb-3">
                  <SleepLogCard
                    entry={{
                      duration: pendingSleep.analysis.duration,
                      bedtime: pendingSleep.analysis.bedtime,
                      wakeTime: pendingSleep.analysis.wakeTime,
                      quality: pendingSleep.analysis.quality,
                    }}
                    sleepGoalMinutes={settings.sleepGoalMinutes}
                    onConfirm={handleConfirmSleep}
                    onCancel={handleCancelSleep}
                  />
                </div>
              )}

              {/* Render pending TrainingLogCard */}
              {pendingTraining && pendingTraining.messageSyncId === message.syncId && (
                <div className="mt-2 mb-3">
                  <TrainingLogCard
                    entry={{
                      muscleGroup: pendingTraining.analysis.muscleGroup,
                      duration: pendingTraining.analysis.duration,
                      notes: pendingTraining.analysis.notes,
                    }}
                    weeklyProgress={trainingContext?.trainingGoalPerWeek ? {
                      done: trainingContext.trainingSessions7Days ?? 0,
                      goal: trainingContext.trainingGoalPerWeek,
                    } : undefined}
                    onConfirm={handleConfirmTraining}
                    onCancel={handleCancelTraining}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Quick replies */}
        {showQuickReplies.length > 0 && !isProcessing && !pendingFood && !pendingSleep && !pendingTraining && (
          <div className="mt-3">
            <QuickReplies
              replies={showQuickReplies}
              onSelect={handleQuickReply}
            />
          </div>
        )}

        <div ref={messagesEndRef} />

        {/* New message pill - shown when scrolled up and new messages arrive */}
        {showNewMessagePill && (
          <button
            onClick={() => scrollToBottom(false)}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-full shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 z-10"
          >
            ↓ New message
          </button>
        )}
      </div>

      {/* Quick Log Shortcuts - shown when input is focused and empty */}
      {!pendingFood && !pendingSleep && !pendingTraining && !isProcessing && showQuickLogSuggestions && (
        <QuickLogShortcuts
          onSelect={handleQuickLog}
          disabled={isProcessing}
        />
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={isProcessing}
        onFocusChange={handleInputFocusChange}
        externalImage={pendingImageFromHome}
        onExternalImageConsumed={handleExternalImageConsumed}
        initialText={prefillText || undefined}
        onInitialTextConsumed={handlePrefillTextConsumed}
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
