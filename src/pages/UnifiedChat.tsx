import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { FoodCard } from '@/components/chat/FoodCard';
import { QuickReplies } from '@/components/chat/QuickReplies';
import { ChatInput } from '@/components/chat/ChatInput';
import { useSettings } from '@/hooks/useProteinData';
import { useProgressInsights } from '@/hooks/useProgressInsights';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { getNickname } from '@/lib/nicknames';
import { addFoodEntry } from '@/db';
import { triggerSync } from '@/store/useAuthStore';
import { getToday } from '@/lib/utils';
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

export function UnifiedChat() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { settings, settingsLoaded } = useSettings();
  const { user } = useAuthStore();
  const insights = useProgressInsights();
  const nickname = getNickname(user?.email);

  const {
    messages,
    messagesLoaded,
    addMessage,
    updateMessage,
    loadMessages,
  } = useStore();

  const [chatHistory, setChatHistory] = useState<UnifiedMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState<string[]>([]);
  const [pendingFood, setPendingFood] = useState<PendingFood | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Load messages on mount
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

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
      .filter(m => m.foodEntry || m.foodEntrySyncId)
      .slice(-5)
      .map(m => m.foodEntry?.foodName)
      .filter(Boolean) as string[];

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
    };
  }, [settings, insights, nickname, messages]);

  // Initialize with smart greeting
  useEffect(() => {
    if (!settingsLoaded || !messagesLoaded || initialized) return;
    setInitialized(true);

    // Only show greeting if no recent messages (within last hour)
    const recentMessage = messages[messages.length - 1];
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (recentMessage && new Date(recentMessage.timestamp).getTime() > oneHourAgo) {
      return; // Skip greeting, user has recent activity
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
  }, [settingsLoaded, messagesLoaded, initialized, getContext, addMessage, messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingFood]);

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

      // Handle food logging intent
      if (result.intent === 'log_food' && result.foodAnalysis) {
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

    await addFoodEntry({
      syncId: foodEntrySyncId,
      date: entryDate,
      source: imageData ? 'photo' : 'text',
      foodName: analysis.foodName,
      protein: analysis.protein,
      calories: analysis.calories,
      confidence: analysis.confidence,
      imageData,
      consumedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Link message to food entry
    updateMessage(messageSyncId, {
      foodEntrySyncId,
    });

    // Add learned preference (favorite)
    await learnPreference(analysis.foodName, 'favorite');

    triggerSync();
    setPendingFood(null);
    setShowQuickReplies([]);

    // Brief confirmation
    addMessage({
      syncId: crypto.randomUUID(),
      type: 'assistant',
      content: `✓ Logged! ${insights.remaining - analysis.protein}g to go.`,
      timestamp: new Date(),
    });
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

  // Loading state
  if (!settingsLoaded || !messagesLoaded) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
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
        {messages.map((message, index) => (
          <MessageBubble
            key={message.syncId}
            message={message}
            isLatestMessage={index === messages.length - 1}
          />
        ))}

        {/* Pending food card */}
        {pendingFood && (
          <div className="mt-3 mb-2">
            <FoodCard
              entry={{
                foodName: pendingFood.analysis.foodName,
                protein: pendingFood.analysis.protein,
                calories: pendingFood.analysis.calories,
                confidence: pendingFood.analysis.confidence,
                imageData: pendingFood.imageData,
              } as FoodEntry}
              onConfirm={handleConfirmFood}
              onEdit={handleEditFood}
              onCancel={handleCancelFood}
              showCalories={settings.calorieTrackingEnabled}
              isConfirmed={false}
            />
          </div>
        )}

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
    </div>
  );
}
