import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { QuickReplies } from '@/components/chat/QuickReplies';
import { useSettings } from '@/hooks/useProteinData';
import { useAuthStore } from '@/store/useAuthStore';
import { useRemainingProtein } from '@/hooks/useProteinData';
import { getNickname } from '@/lib/nicknames';
import {
  getAdvisorSuggestion,
  analyzeMenuForUser,
  parseSleepTimeFromReply,
  type AdvisorContext,
  type AdvisorMessage,
} from '@/services/ai/advisor';
import type { ChatMessage, DietaryPreferences } from '@/types';
import { AdvisorInput } from '@/components/advisor/AdvisorInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';

// Onboarding step definitions
interface OnboardingStep {
  id: keyof DietaryPreferences | 'complete';
  question: string;
  quickReplies: string[];
  allowFreeText?: boolean;
  multiSelect?: boolean;
  reactions: Record<string, string>;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'allergies',
    question: "Any food allergies I should know about?",
    quickReplies: ['None', 'Peanuts', 'Tree nuts', 'Dairy', 'Shellfish'],
    allowFreeText: true,
    multiSelect: true,
    reactions: {
      None: "Nice! That gives us lots of options.",
      default: "Got it, I'll steer clear of those.",
    },
  },
  {
    id: 'intolerances',
    question: "Foods that don't sit well with you?",
    quickReplies: ['None', 'Lactose', 'Gluten', 'Fructose'],
    allowFreeText: true,
    multiSelect: true,
    reactions: {
      None: "Lucky you! Digestion of steel.",
      Lactose: "No problem - plenty of great non-dairy protein out there.",
      Gluten: "Easy - most protein sources are naturally gluten-free!",
      default: "Noted! I'll keep that in mind.",
    },
  },
  {
    id: 'dietaryRestrictions',
    question: 'Following any specific diet?',
    quickReplies: ['None', 'Vegetarian', 'Vegan', 'Halal', 'Keto'],
    allowFreeText: true,
    multiSelect: true,
    reactions: {
      None: "Flexible eater - I like it!",
      Vegetarian: "Great choice! Lots of tasty plant protein options.",
      Vegan: "Awesome! I know all the best plant-based protein hacks.",
      Keto: "High protein + keto = we're gonna get along great.",
      default: "Perfect, I'll keep your suggestions on track.",
    },
  },
  {
    id: 'dislikes',
    question: "Any foods you just can't stand?",
    quickReplies: ['None', 'Skip'],
    allowFreeText: true,
    multiSelect: true,
    reactions: {
      None: "Not picky at all - this is gonna be easy!",
      Skip: "No worries, we can figure that out as we go.",
      default: "Fair enough, we all have our things.",
    },
  },
  {
    id: 'sleepTime',
    question: "Last one - when do you usually sleep? I'll avoid heavy meals too late.",
    quickReplies: ['10 PM', '11 PM', 'Midnight', 'After midnight', 'Skip'],
    allowFreeText: false,
    multiSelect: false,
    reactions: {
      '10 PM': "Early bird! I respect that.",
      '11 PM': "Solid schedule!",
      'Midnight': "Night owl tendencies, got it.",
      'After midnight': "True night owl! No judgment here.",
      Skip: "No worries, I'll use my best judgment.",
      default: "Got it!",
    },
  },
];

export function Advisor() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { settings, updateSettings } = useSettings();
  const { user } = useAuthStore();
  const { remaining, goal, consumed } = useRemainingProtein();
  const nickname = getNickname(user?.email);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [advisorHistory, setAdvisorHistory] = useState<AdvisorMessage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Onboarding state
  const [onboardingStep, setOnboardingStep] = useState(-1); // -1 = not onboarding
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const [pendingPreferences, setPendingPreferences] = useState<DietaryPreferences>({
    allergies: [],
    intolerances: [],
    dietaryRestrictions: [],
    dislikes: [],
    favorites: [],
  });

  // Message queue for typewriter effect
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const isOnboarding = onboardingStep >= 0 && onboardingStep < ONBOARDING_STEPS.length;
  const currentStepData = isOnboarding ? ONBOARDING_STEPS[onboardingStep] : null;

  // Build advisor context
  const getAdvisorContext = useCallback((): AdvisorContext => {
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
  }, [goal, consumed, remaining, settings.dietaryPreferences, nickname]);

  // Add message with loading state for typewriter
  const addMessageWithTypewriter = useCallback((content: string, type: 'system' | 'assistant' = 'system') => {
    const syncId = crypto.randomUUID();

    // Add loading message first
    setMessages((prev) => [
      ...prev,
      {
        syncId,
        type,
        content: '',
        isLoading: true,
        timestamp: new Date(),
      },
    ]);

    // Short delay then show content (triggers typewriter)
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.syncId === syncId ? { ...msg, isLoading: false, content } : msg
        )
      );
    }, 400);

    return syncId;
  }, []);

  // Process message queue
  useEffect(() => {
    if (messageQueue.length > 0 && !isTyping) {
      setIsTyping(true);
      const nextMessage = messageQueue[0];
      addMessageWithTypewriter(nextMessage);

      // Remove from queue after delay
      setTimeout(() => {
        setMessageQueue((prev) => prev.slice(1));
        setIsTyping(false);
      }, nextMessage.length * 12 + 600); // Approximate typing time
    }
  }, [messageQueue, isTyping, addMessageWithTypewriter]);

  // Initialize
  useEffect(() => {
    if (initialized) return;

    if (!settings.advisorOnboarded) {
      // Start onboarding
      setOnboardingStep(0);
      const greeting = nickname ? `Hey ${nickname}! ` : 'Hey! ';
      setMessageQueue([
        `${greeting}Quick intro so I can give you useful suggestions.`,
        ONBOARDING_STEPS[0].question,
      ]);
    } else {
      // Normal welcome
      const greeting = nickname ? `Hey ${nickname}! ` : 'Hey! ';
      addMessageWithTypewriter(
        `${greeting}You have ${remaining}g protein left today. I can:\n\n• **Suggest your next meal** - based on time & preferences\n• **Evaluate a food choice** - "Is Greek yogurt good right now?"\n• **Analyze a menu photo** - I'll pick the best protein options\n• **Answer nutrition questions**\n\nWhat can I help with?`
      );
    }
    setInitialized(true);
  }, [initialized, settings.advisorOnboarded, remaining, nickname, addMessageWithTypewriter]);

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

  // Onboarding handlers
  const getReaction = (step: OnboardingStep, response: string[]): string => {
    const responseText = response.length === 0 ? 'None' : response[0];
    return step.reactions[responseText] || step.reactions.default || '';
  };

  const handleOnboardingSelect = (reply: string) => {
    if (!currentStepData) return;

    if (currentStepData.multiSelect) {
      if (reply === 'None' || reply === 'Skip') {
        processOnboardingResponse([]);
      } else {
        setSelectedItems((prev) =>
          prev.includes(reply)
            ? prev.filter((item) => item !== reply)
            : [...prev, reply]
        );
      }
    } else {
      processOnboardingResponse([reply]);
    }
  };

  const handleConfirmSelection = () => {
    if (selectedItems.length > 0) {
      processOnboardingResponse(selectedItems);
    }
  };

  const handleFreeTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (freeText.trim()) {
      const items = freeText.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      processOnboardingResponse([...selectedItems, ...items]);
    }
  };

  const processOnboardingResponse = async (response: string[]) => {
    if (!currentStepData) return;

    // Add user response
    const responseText = response.length === 0 ? 'None' : response.join(', ');
    addMessage({
      syncId: crypto.randomUUID(),
      type: 'user',
      content: responseText,
      timestamp: new Date(),
    });

    // Update preferences
    const newPrefs = { ...pendingPreferences };
    if (currentStepData.id === 'sleepTime') {
      const sleepReply = response[0];
      if (sleepReply && sleepReply !== 'Skip') {
        const sleepTime = parseSleepTimeFromReply(sleepReply);
        if (sleepTime) newPrefs.sleepTime = sleepTime;
      }
    } else if (currentStepData.id !== 'complete') {
      const cleanedResponse = response
        .filter((r) => r !== 'None' && r !== 'Skip')
        .map((r) => r.toLowerCase());

      if (currentStepData.id === 'allergies') newPrefs.allergies = cleanedResponse;
      else if (currentStepData.id === 'intolerances') newPrefs.intolerances = cleanedResponse;
      else if (currentStepData.id === 'dietaryRestrictions') newPrefs.dietaryRestrictions = cleanedResponse;
      else if (currentStepData.id === 'dislikes') newPrefs.dislikes = cleanedResponse;
    }

    setPendingPreferences(newPrefs);
    setSelectedItems([]);
    setFreeText('');

    const reaction = getReaction(currentStepData, response);
    const nextStep = onboardingStep + 1;

    if (nextStep < ONBOARDING_STEPS.length) {
      setOnboardingStep(nextStep);
      const messagesToQueue = [];
      if (reaction) messagesToQueue.push(reaction);
      messagesToQueue.push(ONBOARDING_STEPS[nextStep].question);
      setMessageQueue(messagesToQueue);
    } else {
      // Complete onboarding
      await updateSettings({
        dietaryPreferences: newPrefs,
        advisorOnboarded: true,
      });
      setOnboardingStep(-1);

      const greeting = nickname ? `Awesome, ${nickname}! ` : 'Awesome! ';
      const messagesToQueue = [];
      if (reaction) messagesToQueue.push(reaction);
      messagesToQueue.push(
        `${greeting}I'm all set! You have ${remaining}g protein left today.\n\nI can:\n• **Suggest your next meal**\n• **Evaluate a food choice**\n• **Analyze a menu photo**\n• **Answer nutrition questions**\n\n_You can update your preferences anytime in Settings._\n\nWhat sounds good?`
      );
      setMessageQueue(messagesToQueue);
    }
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
      addMessageWithTypewriter('Please add your Claude API key in Settings to use Food Buddy.');
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

  // Handle image messages
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
      addMessageWithTypewriter('Please add your Claude API key in Settings to analyze menus.');
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

  const handleQuickReply = (reply: string) => {
    handleSendText(reply);
  };

  const showSelectedChips = currentStepData?.multiSelect && selectedItems.length > 0;
  const showOnboardingControls = isOnboarding && !isTyping && messageQueue.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable messages area */}
      <div className="flex-1 overflow-y-auto p-4 pb-2">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.syncId}
            message={message}
            onQuickReply={!isOnboarding ? handleQuickReply : undefined}
            isLatestMessage={index === messages.length - 1}
          />
        ))}

        {/* Onboarding controls */}
        {showOnboardingControls && currentStepData && (
          <div className="mt-4 space-y-3">
            {showSelectedChips && (
              <div className="flex flex-wrap gap-2">
                {selectedItems.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary text-primary-foreground text-sm"
                  >
                    {item}
                    <button
                      onClick={() => setSelectedItems((prev) => prev.filter((i) => i !== item))}
                      className="hover:bg-primary-foreground/20 rounded-full p-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <QuickReplies
              replies={currentStepData.quickReplies.filter((r) => !selectedItems.includes(r))}
              onSelect={handleOnboardingSelect}
            />

            {currentStepData.multiSelect && selectedItems.length > 0 && (
              <Button onClick={handleConfirmSelection} className="w-full">
                Continue with selected ({selectedItems.length})
              </Button>
            )}

            {currentStepData.allowFreeText && (
              <form onSubmit={handleFreeTextSubmit} className="flex gap-2">
                <Input
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Or type custom items (comma separated)..."
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={!freeText.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Fixed input at bottom */}
      {!isOnboarding && (
        <AdvisorInput
          onSendText={handleSendText}
          onSendImage={handleSendImage}
          disabled={isAnalyzing}
        />
      )}
    </div>
  );
}
