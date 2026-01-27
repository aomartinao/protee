import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { QuickReplies } from '@/components/chat/QuickReplies';
import { useSettings } from '@/hooks/useProteinData';
import { useProgressInsights } from '@/hooks/useProgressInsights';
import { useAuthStore } from '@/store/useAuthStore';
import { useStore } from '@/store/useStore';
import { getNickname } from '@/lib/nicknames';
import {
  getCoachResponse,
  analyzeMenuWithCoach,
  generateProactiveGreeting,
  type CoachContext,
  type CoachMessage,
} from '@/services/ai/coach';
import type { DietaryPreferences } from '@/types';
import { AdvisorInput } from '@/components/advisor/AdvisorInput';
import { Loader2 } from 'lucide-react';

export function Coach() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { settings, settingsLoaded } = useSettings();
  const { user } = useAuthStore();
  const insights = useProgressInsights();
  const nickname = getNickname(user?.email);

  // Use store for messages
  const {
    advisorMessages: messages,
    advisorInitialized: initialized,
    addAdvisorMessage,
    updateAdvisorMessage,
    setAdvisorInitialized: setInitialized,
  } = useStore();

  const [coachHistory, setCoachHistory] = useState<CoachMessage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState<string[]>([]);

  // Build coach context
  const getCoachContext = useCallback((): CoachContext => {
    const prefs: DietaryPreferences = settings.dietaryPreferences || {
      allergies: [],
      intolerances: [],
      dietaryRestrictions: [],
      dislikes: [],
      favorites: [],
    };

    return {
      goal: settings.defaultGoal,
      consumed: insights.todayProtein,
      remaining: insights.remaining,
      currentTime: new Date(),
      sleepTime: prefs.sleepTime,
      preferences: prefs,
      nickname,
      insights,
    };
  }, [settings, insights, nickname]);

  // Initialize with proactive greeting
  useEffect(() => {
    if (!settingsLoaded) return;
    if (initialized) return;
    setInitialized(true);

    const context = getCoachContext();
    const greeting = generateProactiveGreeting(context);

    addAdvisorMessage({
      syncId: crypto.randomUUID(),
      type: 'assistant',
      content: greeting.message,
      timestamp: new Date(),
    });

    if (greeting.quickReplies) {
      setShowQuickReplies(greeting.quickReplies);
    }
  }, [settingsLoaded, initialized, setInitialized, getCoachContext, addAdvisorMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle text messages
  const handleSendText = async (text: string) => {
    // Clear quick replies when user sends a message
    setShowQuickReplies([]);

    const userSyncId = crypto.randomUUID();
    addAdvisorMessage({
      syncId: userSyncId,
      type: 'user',
      content: text,
      timestamp: new Date(),
    });

    const hasApiAccess = settings.claudeApiKey || settings.hasAdminApiKey;
    const useProxy = !settings.claudeApiKey && settings.hasAdminApiKey;

    if (!hasApiAccess) {
      addAdvisorMessage({
        syncId: crypto.randomUUID(),
        type: 'system',
        content: 'Please add your Claude API key in Settings to use the Coach.',
        timestamp: new Date(),
      });
      return;
    }

    const loadingSyncId = crypto.randomUUID();
    addAdvisorMessage({
      syncId: loadingSyncId,
      type: 'assistant',
      content: '',
      isLoading: true,
      timestamp: new Date(),
    });

    setIsAnalyzing(true);

    try {
      const context = getCoachContext();
      const result = await getCoachResponse(
        settings.claudeApiKey || null,
        text,
        context,
        coachHistory,
        useProxy
      );

      setCoachHistory([
        ...coachHistory,
        { role: 'user', content: text },
        { role: 'assistant', content: result.message },
      ]);

      updateAdvisorMessage(loadingSyncId, {
        isLoading: false,
        content: result.message,
      });

      if (result.quickReplies) {
        setShowQuickReplies(result.quickReplies);
      }
    } catch (error) {
      updateAdvisorMessage(loadingSyncId, {
        isLoading: false,
        content: `Sorry, I couldn't respond right now. ${error instanceof Error ? error.message : 'Please try again.'}`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle image messages (menu analysis)
  const handleSendImage = async (imageData: string) => {
    setShowQuickReplies([]);

    const userSyncId = crypto.randomUUID();
    addAdvisorMessage({
      syncId: userSyncId,
      type: 'user',
      content: '',
      imageData,
      timestamp: new Date(),
    });

    const hasApiAccess = settings.claudeApiKey || settings.hasAdminApiKey;
    const useProxy = !settings.claudeApiKey && settings.hasAdminApiKey;

    if (!hasApiAccess) {
      addAdvisorMessage({
        syncId: crypto.randomUUID(),
        type: 'system',
        content: 'Please add your Claude API key in Settings to analyze menus.',
        timestamp: new Date(),
      });
      return;
    }

    const loadingSyncId = crypto.randomUUID();
    addAdvisorMessage({
      syncId: loadingSyncId,
      type: 'assistant',
      content: '',
      isLoading: true,
      timestamp: new Date(),
    });

    setIsAnalyzing(true);

    try {
      const context = getCoachContext();
      const result = await analyzeMenuWithCoach(
        settings.claudeApiKey || null,
        imageData,
        context,
        undefined,
        useProxy
      );

      updateAdvisorMessage(loadingSyncId, {
        isLoading: false,
        content: result.message,
      });

      if (result.quickReplies) {
        setShowQuickReplies(result.quickReplies);
      }
    } catch (error) {
      updateAdvisorMessage(loadingSyncId, {
        isLoading: false,
        content: `Sorry, I couldn't analyze that. ${error instanceof Error ? error.message : 'Please try again.'}`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleQuickReply = (reply: string) => {
    handleSendText(reply);
  };

  // Show loading while settings load
  if (!settingsLoaded) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Progress summary bar */}
      <div className="px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center justify-between text-sm">
          <div>
            <span className="font-semibold text-primary">{insights.todayProtein}g</span>
            <span className="text-muted-foreground"> / {settings.defaultGoal}g today</span>
          </div>
          <div className="text-muted-foreground">
            {insights.currentStreak > 0 && (
              <span className="text-orange-500 font-medium">🔥 {insights.currentStreak} day streak</span>
            )}
          </div>
        </div>
        <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, insights.percentComplete)}%` }}
          />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 pb-2 min-h-0 scroll-smooth">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.syncId}
            message={message}
            isLatestMessage={index === messages.length - 1}
          />
        ))}

        {/* Quick replies */}
        {showQuickReplies.length > 0 && !isAnalyzing && (
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
      <AdvisorInput
        onSendText={handleSendText}
        onSendImage={handleSendImage}
        disabled={isAnalyzing}
      />
    </div>
  );
}
