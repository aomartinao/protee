import { useEffect, useRef, useState } from 'react';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { AdvisorOnboarding } from '@/components/advisor/AdvisorOnboarding';
import { useStore } from '@/store/useStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useRemainingProtein } from '@/hooks/useProteinData';
import { getNickname } from '@/lib/nicknames';
import {
  getAdvisorSuggestion,
  analyzeMenuForUser,
  type AdvisorContext,
  type AdvisorMessage,
} from '@/services/ai/advisor';
import type { ChatMessage, DietaryPreferences } from '@/types';
import { AdvisorInput } from '@/components/advisor/AdvisorInput';

export function Advisor() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { settings } = useStore();
  const { user } = useAuthStore();
  const { remaining, goal, consumed } = useRemainingProtein();
  const nickname = getNickname(user?.email);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [advisorHistory, setAdvisorHistory] = useState<AdvisorMessage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Build advisor context
  const getAdvisorContext = (): AdvisorContext => {
    const prefs: DietaryPreferences = settings.dietaryPreferences || {
      allergies: [],
      intolerances: [],
      dietaryRestrictions: [],
      dislikes: [],
      favorites: [],
    };

    return {
      goal,
      consumed,
      remaining,
      currentTime: new Date(),
      sleepTime: prefs.sleepTime,
      preferences: prefs,
      nickname,
    };
  };

  // Initialize advisor
  useEffect(() => {
    if (initialized) return;

    // Check if onboarding needed
    if (!settings.advisorOnboarded) {
      setShowOnboarding(true);
      setInitialized(true);
      return;
    }

    // Add welcome message
    const greeting = nickname ? `Hey ${nickname}! ` : '';
    setMessages([
      {
        syncId: crypto.randomUUID(),
        type: 'system',
        content: `${greeting}You have ${remaining}g protein remaining today. Ask me what to eat, or share a menu photo for recommendations.`,
        timestamp: new Date(),
      },
    ]);
    setInitialized(true);
  }, [initialized, settings.advisorOnboarded, remaining, nickname]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = (message: Omit<ChatMessage, 'id'>) => {
    setMessages((prev) => [...prev, message as ChatMessage]);
  };

  const updateMessage = (syncId: string, updates: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.syncId === syncId ? { ...msg, ...updates } : msg
      )
    );
  };

  // Handle text messages
  const handleSendText = async (text: string) => {
    const userSyncId = crypto.randomUUID();
    addMessage({
      syncId: userSyncId,
      type: 'user',
      content: text,
      timestamp: new Date(),
    });

    if (!settings.claudeApiKey) {
      addMessage({
        syncId: crypto.randomUUID(),
        type: 'system',
        content: 'Please add your Claude API key in Settings to use Food Buddy.',
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

    setIsAnalyzing(true);

    try {
      const context = getAdvisorContext();
      const result = await getAdvisorSuggestion(
        settings.claudeApiKey,
        text,
        context,
        advisorHistory
      );

      // Update conversation history
      setAdvisorHistory([
        ...advisorHistory,
        { role: 'user', content: text },
        { role: 'assistant', content: result.message },
      ]);

      updateMessage(loadingSyncId, {
        isLoading: false,
        content: result.message,
        advisorQuickReplies: result.quickReplies,
      });
    } catch (error) {
      updateMessage(loadingSyncId, {
        isLoading: false,
        content: `Sorry, I couldn't get suggestions right now. ${error instanceof Error ? error.message : 'Please try again.'}`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle image messages (menu analysis)
  const handleSendImage = async (imageData: string) => {
    const userSyncId = crypto.randomUUID();
    addMessage({
      syncId: userSyncId,
      type: 'user',
      content: '',
      imageData,
      timestamp: new Date(),
    });

    if (!settings.claudeApiKey) {
      addMessage({
        syncId: crypto.randomUUID(),
        type: 'system',
        content: 'Please add your Claude API key in Settings to analyze menus.',
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

    setIsAnalyzing(true);

    try {
      const context = getAdvisorContext();
      const result = await analyzeMenuForUser(
        settings.claudeApiKey,
        imageData,
        context
      );

      updateMessage(loadingSyncId, {
        isLoading: false,
        content: result.message,
        advisorQuickReplies: result.quickReplies,
      });
    } catch (error) {
      updateMessage(loadingSyncId, {
        isLoading: false,
        content: `Sorry, I couldn't analyze that menu. ${error instanceof Error ? error.message : 'Please try again.'}`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle quick reply selection
  const handleQuickReply = (reply: string) => {
    handleSendText(reply);
  };

  // Handle onboarding completion
  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    const greeting = nickname ? `Great, ${nickname}! ` : 'Great! ';
    addMessage({
      syncId: crypto.randomUUID(),
      type: 'system',
      content: `${greeting}Food Buddy is ready. You have ${remaining}g protein remaining today. What would you like to eat?`,
      timestamp: new Date(),
    });
  };

  // Show onboarding if needed
  if (showOnboarding) {
    return <AdvisorOnboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.syncId}
            message={message}
            onQuickReply={handleQuickReply}
            isLatestMessage={index === messages.length - 1}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <AdvisorInput
        onSendText={handleSendText}
        onSendImage={handleSendImage}
        disabled={isAnalyzing}
      />
    </div>
  );
}
