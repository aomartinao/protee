import { useState, useEffect } from 'react';
import { QuickReplies } from '@/components/chat/QuickReplies';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/useProteinData';
import { parseSleepTimeFromReply } from '@/services/ai/advisor';
import type { DietaryPreferences } from '@/types';
import { cn } from '@/lib/utils';
import { Send } from 'lucide-react';

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
      None: "Nice! That gives us lots of options to work with.",
      default: "Got it, I'll steer clear of those.",
    },
  },
  {
    id: 'intolerances',
    question: "How about foods that just don't sit well with you?",
    quickReplies: ['None', 'Lactose', 'Gluten', 'Fructose'],
    allowFreeText: true,
    multiSelect: true,
    reactions: {
      None: "Lucky you! Digestion of steel.",
      Lactose: "No problem - plenty of great non-dairy protein out there.",
      Gluten: "Easy - most protein sources are naturally gluten-free anyway!",
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
    quickReplies: ['None', 'Skip this'],
    allowFreeText: true,
    multiSelect: true,
    reactions: {
      None: "Not picky at all - this is gonna be easy!",
      'Skip this': "No worries, we can figure that out as we go.",
      default: "Fair enough, we all have our things.",
    },
  },
  {
    id: 'sleepTime',
    question: "Last one - when do you usually hit the pillow? I'll avoid heavy meals too late.",
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

interface OnboardingMessageProps {
  content: string;
  isUser?: boolean;
}

function OnboardingMessage({ content, isUser }: OnboardingMessageProps) {
  return (
    <div
      className={cn(
        'flex w-full mb-3',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%]',
          isUser
            ? 'rounded-2xl rounded-br-md px-4 py-2 bg-primary text-primary-foreground'
            : 'text-foreground/80 text-sm py-1'
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

interface AdvisorOnboardingProps {
  onComplete: () => void;
}

export function AdvisorOnboarding({ onComplete }: AdvisorOnboardingProps) {
  const { updateSettings } = useSettings();
  const [currentStep, setCurrentStep] = useState(0);
  const [messages, setMessages] = useState<{ content: string; isUser: boolean }[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const [preferences, setPreferences] = useState<DietaryPreferences>({
    allergies: [],
    intolerances: [],
    dietaryRestrictions: [],
    dislikes: [],
    favorites: [],
  });

  // Initialize with first question
  useEffect(() => {
    if (messages.length === 0 && ONBOARDING_STEPS.length > 0) {
      setMessages([
        {
          content: "Hey! Quick intro so I can give you useful suggestions.",
          isUser: false,
        },
        {
          content: ONBOARDING_STEPS[0].question,
          isUser: false,
        },
      ]);
    }
  }, [messages.length]);

  const currentStepData = ONBOARDING_STEPS[currentStep];

  const handleSelect = (reply: string) => {
    if (currentStepData.multiSelect) {
      if (reply === 'None' || reply === 'Skip' || reply === 'Skip this') {
        // Clear selection and move to next step
        processResponse([]);
      } else {
        // Toggle selection
        setSelectedItems((prev) =>
          prev.includes(reply)
            ? prev.filter((item) => item !== reply)
            : [...prev, reply]
        );
      }
    } else {
      // Single select - process immediately
      processResponse([reply]);
    }
  };

  const handleConfirmSelection = () => {
    if (selectedItems.length > 0) {
      processResponse(selectedItems);
    }
  };

  const handleFreeTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (freeText.trim()) {
      // Split by commas and add to selection
      const items = freeText.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      processResponse([...selectedItems, ...items]);
    }
  };

  // Get appropriate reaction based on response
  const getReaction = (step: OnboardingStep, response: string[]): string => {
    const responseText = response.length === 0 ? 'None' : response[0];

    // Check for specific reaction first
    if (step.reactions[responseText]) {
      return step.reactions[responseText];
    }

    // Fall back to default
    return step.reactions.default || '';
  };

  const processResponse = (response: string[]) => {
    const step = ONBOARDING_STEPS[currentStep];

    // Add user response to messages
    const responseText = response.length === 0
      ? 'None'
      : response.join(', ');
    setMessages((prev) => [...prev, { content: responseText, isUser: true }]);

    // Update preferences based on step
    const newPrefs = { ...preferences };

    if (step.id === 'sleepTime') {
      const sleepReply = response[0];
      if (sleepReply && sleepReply !== 'Skip') {
        const sleepTime = parseSleepTimeFromReply(sleepReply);
        if (sleepTime) {
          newPrefs.sleepTime = sleepTime;
        }
      }
    } else if (step.id !== 'complete') {
      // Handle list-based preferences
      const cleanedResponse = response.filter(
        (r) => r !== 'None' && r !== 'Skip' && r !== 'Skip this'
      ).map((r) => r.toLowerCase());

      if (step.id === 'allergies') newPrefs.allergies = cleanedResponse;
      else if (step.id === 'intolerances') newPrefs.intolerances = cleanedResponse;
      else if (step.id === 'dietaryRestrictions') newPrefs.dietaryRestrictions = cleanedResponse;
      else if (step.id === 'dislikes') newPrefs.dislikes = cleanedResponse;
    }

    setPreferences(newPrefs);
    setSelectedItems([]);
    setFreeText('');

    // Get reaction for this response
    const reaction = getReaction(step, response);

    // Move to next step
    const nextStep = currentStep + 1;
    if (nextStep < ONBOARDING_STEPS.length) {
      setCurrentStep(nextStep);
      // Add reaction and next question
      setMessages((prev) => [
        ...prev,
        ...(reaction ? [{ content: reaction, isUser: false }] : []),
        { content: ONBOARDING_STEPS[nextStep].question, isUser: false },
      ]);
    } else {
      // Onboarding complete
      completeOnboarding(newPrefs, reaction);
    }
  };

  const completeOnboarding = async (finalPrefs: DietaryPreferences, lastReaction?: string) => {
    // Add reaction and completion message
    setMessages((prev) => [
      ...prev,
      ...(lastReaction ? [{ content: lastReaction, isUser: false }] : []),
      {
        content: "Alright, I'm all set! Ready to help you crush your protein goals. What sounds good?",
        isUser: false,
      },
    ]);

    // Save preferences
    await updateSettings({
      dietaryPreferences: finalPrefs,
      advisorOnboarded: true,
    });

    // Notify parent
    setTimeout(() => {
      onComplete();
    }, 1500);
  };

  // Show selected items as chips if multi-select
  const showSelectedChips = currentStepData?.multiSelect && selectedItems.length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((msg, i) => (
          <OnboardingMessage key={i} content={msg.content} isUser={msg.isUser} />
        ))}

        {/* Current step quick replies */}
        {currentStepData && currentStep < ONBOARDING_STEPS.length && (
          <div className="mt-4 space-y-3">
            {/* Selected items chips */}
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

            {/* Quick reply buttons */}
            <QuickReplies
              replies={currentStepData.quickReplies.filter(
                (r) => !selectedItems.includes(r)
              )}
              onSelect={handleSelect}
            />

            {/* Confirm button for multi-select */}
            {currentStepData.multiSelect && selectedItems.length > 0 && (
              <Button
                onClick={handleConfirmSelection}
                className="w-full"
              >
                Continue with selected ({selectedItems.length})
              </Button>
            )}

            {/* Free text input */}
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
      </div>
    </div>
  );
}
