import Anthropic from '@anthropic-ai/sdk';
import type { DietaryPreferences } from '@/types';
import type { ProgressInsights } from '@/hooks/useProgressInsights';
import { sendProxyRequest, parseProxyResponse, type ProxyMessageContent } from './proxy';

// Food categories for variety tracking
export type FoodCategory = 'meat' | 'dairy' | 'seafood' | 'plant' | 'eggs' | 'other';

export interface LastLoggedEntry {
  syncId: string;
  foodName: string;
  protein: number;
  calories?: number;
  loggedMinutesAgo: number;
}

// MPS (Muscle Protein Synthesis) analysis
export interface MPSAnalysis {
  hitsToday: number;
  minutesSinceLastHit: number | null;
  lastHitProtein: number | null;
  nearMiss?: {
    type: 'timing' | 'protein' | 'both';
    actual: {
      protein?: number;
      minutesSinceLast?: number;
    };
  };
}

// Protein breakdown by category
export interface CategoryBreakdown {
  meat: number;
  dairy: number;
  seafood: number;
  plant: number;
  eggs: number;
  other: number;
}

export interface UnifiedContext {
  goal: number;
  consumed: number;
  remaining: number;
  currentTime: Date;
  sleepTime?: string;
  preferences: DietaryPreferences;
  nickname?: string;
  insights: ProgressInsights;
  recentMeals?: string[];
  lastLoggedEntry?: LastLoggedEntry;

  // NEW: Enhanced context for coaching
  mpsAnalysis?: MPSAnalysis;
  todayByCategory?: CategoryBreakdown;
  preferencesSource?: 'settings' | 'conversation' | 'none';
  unknownPreferences?: string[];
  askedPreferenceThisSession?: boolean;
}

export interface UnifiedMessage {
  role: 'user' | 'assistant';
  content: string;
  imageData?: string;
}

export type MessageIntent =
  | 'log_food'
  | 'correct_food'
  | 'analyze_menu'
  | 'question'
  | 'greeting'
  | 'preference_update'
  | 'other';

// Note: 'greeting' is now properly handled in parseUnifiedResponse

export type CoachingType =
  | 'mps_hit'
  | 'mps_timing'
  | 'mps_protein'
  | 'timing_warning'
  | 'variety_nudge'
  | 'pacing'
  | 'celebration'
  | 'tip'
  | 'preference_question';

export interface FoodAnalysis {
  foodName: string;
  protein: number;
  calories?: number;
  confidence: 'high' | 'medium' | 'low';
  category?: FoodCategory;
  consumedAt?: {
    parsedDate: string;
    parsedTime: string;
  };
}

export interface CoachingMessage {
  type: CoachingType;
  message: string;
  quickReplies?: string[];
  learnsPreference?: keyof DietaryPreferences;
}

export interface MenuPick {
  name: string;
  protein: number;
  calories?: number;
  why: string;
}

export interface UnifiedResponse {
  intent: MessageIntent;

  // Brief acknowledgment (for food logging)
  acknowledgment?: string;

  // Main message (for questions, greetings)
  message: string;

  // If food was detected
  foodAnalysis?: FoodAnalysis;

  // Coaching nudge (optional, contextual)
  coaching?: CoachingMessage;

  // Quick reply suggestions
  quickReplies?: string[];

  // For menus
  menuPicks?: MenuPick[];

  // For corrections
  correctsPreviousEntry?: boolean;

  // For preference learning
  learnedPreferences?: Partial<DietaryPreferences>;
}

function buildUnifiedSystemPrompt(context: UnifiedContext): string {
  const {
    goal,
    consumed,
    remaining,
    currentTime,
    sleepTime,
    preferences,
    nickname,
    lastLoggedEntry,
    mpsAnalysis,
    todayByCategory,
  } = context;

  const hour = currentTime.getHours();
  const name = nickname || 'friend';

  // Calculate hours until sleep
  let hoursUntilSleep: number | null = null;
  if (sleepTime) {
    const [sleepHour] = sleepTime.split(':').map(Number);
    hoursUntilSleep = sleepHour > hour ? sleepHour - hour : (24 - hour) + sleepHour;
    if (hoursUntilSleep > 16) hoursUntilSleep = null; // Sanity check
  }

  // Format dietary restrictions
  const restrictionsList = [
    preferences.allergies?.length ? `ALLERGIES (NEVER suggest): ${preferences.allergies.join(', ')}` : '',
    preferences.intolerances?.length ? `Intolerances (avoid): ${preferences.intolerances.join(', ')}` : '',
    preferences.dietaryRestrictions?.length ? `Diet: ${preferences.dietaryRestrictions.join(', ')}` : '',
    preferences.dislikes?.length ? `Dislikes: ${preferences.dislikes.join(', ')}` : '',
    preferences.favorites?.length ? `Favorites: ${preferences.favorites.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  // Last entry context
  const lastEntryInfo = lastLoggedEntry
    ? `LAST LOGGED (${lastLoggedEntry.loggedMinutesAgo}min ago): "${lastLoggedEntry.foodName}" - ${lastLoggedEntry.protein}g protein`
    : '';

  // MPS context
  const mpsInfo = mpsAnalysis
    ? `MPS HITS TODAY: ${mpsAnalysis.hitsToday} | Minutes since last qualified meal: ${mpsAnalysis.minutesSinceLastHit ?? 'none yet'}`
    : '';

  // Category breakdown
  const categoryInfo = todayByCategory
    ? `TODAY'S PROTEIN BY SOURCE: Meat ${todayByCategory.meat}g | Dairy ${todayByCategory.dairy}g | Plant ${todayByCategory.plant}g | Seafood ${todayByCategory.seafood}g | Eggs ${todayByCategory.eggs}g | Other ${todayByCategory.other}g`
    : '';

  // Determine dominant category
  let dominantCategory = '';
  if (todayByCategory) {
    const categories = Object.entries(todayByCategory) as [string, number][];
    const sorted = categories.sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] > 0) {
      dominantCategory = sorted[0][0];
    }
  }

  // Next MPS hit number for prompt
  const nextMpsHit = (mpsAnalysis?.hitsToday ?? 0) + 1;

  return `You are ${name}'s protein coach. You help log food AND answer nutrition questions.

## FIRST: Is this a QUESTION or FOOD?

**BEFORE doing anything else, ask yourself: Is the user asking a QUESTION or logging FOOD?**

QUESTION indicators (use intent "question"):
- Contains "?"
- Starts with "what", "why", "how", "should", "can", "is", "does", "will"
- Asks for advice, explanation, or information
- Examples: "What is MPS?", "Why does protein matter?", "How much should I eat?"

FOOD indicators (use intent "log_food"):
- Describes something they ATE: "had chicken", "ate 2 eggs", "just finished a shake"
- Contains food quantities: "200g", "2 eggs", "a bowl of"
- Photo of food or nutrition label

⚠️ **NEVER return intent "log_food" for a question. If someone asks "What is protein?" that is NOT a food entry — it's a question. Return intent "question" with a helpful answer.**

## INTENT DETECTION

| Message type | Intent | Example |
|--------------|--------|---------|
| Question about nutrition | question | "What is MPS?", "How much protein do I need?" |
| Food they ate | log_food | "had 200g chicken", "2 eggs for breakfast" |
| Correcting previous entry | correct_food | "actually it was 3 eggs", "make that 150g" |
| Restaurant menu photo | analyze_menu | [image of menu] |
| Sharing dietary info | preference_update | "I'm vegan", "allergic to nuts" |
| Greeting/chitchat | greeting | "hi", "thanks" |

## RESPONSE FORMAT

### IF the message is a QUESTION → use this format:

\`\`\`json
{
  "intent": "question",
  "message": "Your helpful answer here...",
  "quickReplies": ["Follow-up 1", "Follow-up 2"]
}
\`\`\`

**DO NOT include "food" field for questions. Just "intent", "message", and optionally "quickReplies".**

Example questions and good answers:
- "What is MPS?" → "MPS (muscle protein synthesis) is how your muscles use protein to repair and grow. You need ~25g protein per meal to trigger it fully — think of it as flipping the 'build muscle' switch."
- "How much protein per meal?" → "Aim for 25-40g per meal. Below 25g doesn't fully trigger MPS, and above 40g has diminishing returns. Quality over quantity!"
- "Best time to eat protein?" → "Spread it across the day, 3-5 hours apart. This gives you more MPS windows than cramming it all in one meal."

### IF the message describes FOOD they ate → use this format:

\`\`\`json
{
  "intent": "log_food",
  "food": {
    "name": "Grilled chicken breast",
    "protein": 62,
    "calories": 330,
    "confidence": "high",
    "category": "meat",
    "consumedAt": {"date": "YYYY-MM-DD", "time": "HH:mm"}
  },
  "acknowledgment": "Nice!",
  "reasoning": "Classic choice — 200g gives you about 62g protein.",
  "coaching": {
    "type": "mps_hit",
    "message": "💪 MPS hit! Great muscle-building stimulus."
  }
}
\`\`\`

**Be conversational, not robotic:**
- **acknowledgment**: Vary it! "Nice!", "Got it!", "Good stuff!", "Solid!", "Ooh, classic!"
- **reasoning**: Talk TO user, not about them. Sound like a friend.
  - ❌ "User explicitly stated 20g protein..."
  - ✅ "20g — not bad for a quick snack!"
- **category**: meat | dairy | seafood | plant | eggs | other
- **coaching**: Include when triggers match (see below)

### For intent: "correct_food"

\`\`\`json
{
  "intent": "correct_food",
  "food": { ...same as log_food... },
  "acknowledgment": "Updated!",
  "correctsPrevious": true
}
\`\`\`

### For intent: "analyze_menu"

\`\`\`json
{
  "intent": "analyze_menu",
  "acknowledgment": "Here are my picks:",
  "menuPicks": [
    {"name": "8oz Ribeye", "protein": 58, "calories": 650, "why": "Hits your ${remaining}g goal"},
    {"name": "Grilled Salmon", "protein": 45, "calories": 400, "why": "Lighter, good omega-3s"}
  ]
}
\`\`\`

### For intent: "greeting"

\`\`\`json
{
  "intent": "greeting",
  "message": "Hey! Ready to log some protein or have questions?"
}
\`\`\`

### For intent: "preference_update"

\`\`\`json
{
  "intent": "preference_update",
  "message": "Noted! I'll remember that.",
  "learnedPreferences": {"dietaryRestrictions": ["vegan"]}
}
\`\`\`

## COACHING TRIGGERS (for log_food intent)

When logging food, check these conditions and ADD a coaching message:

| Condition | Type | Message |
|-----------|------|---------|
| protein >= 25 AND minutesSinceLastHit >= 180 (or first meal) | mps_hit | "💪 MPS hit #${nextMpsHit}! Solid stimulus." |
| protein >= 20 AND protein < 25 | mps_protein | "Close to 25g! A bit more would trigger full MPS." |
| minutesSinceLastHit < 180 AND minutesSinceLastHit != null | mps_timing | "Good protein, but only Xmin since last meal. 3h+ spacing maximizes MPS." |
| protein >= 30 AND hoursUntilSleep <= 3 | timing_warning | "Heavy protein late — may affect sleep. Lighter options: yogurt, cottage cheese." |
| consumed + this meal's protein >= goal (${goal}g) | celebration | "🎯 Goal hit! [total]g today." |
| consumed + this meal's protein >= goal * 0.9 | celebration | "Almost there! Just [remaining]g to go." |
| ${dominantCategory || 'one category'} accounts for >60% of today's protein | variety_nudge | "Lots of ${dominantCategory || 'one source'} today — try mixing sources for better aminos." |

**IMPORTANT: Include coaching when conditions match. Don't skip it.**

## CONTEXT

USER: ${name}
PROGRESS: ${consumed}g / ${goal}g (${remaining}g remaining)
TIME: ${currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
${sleepTime ? `SLEEP TIME: ~${sleepTime} (${hoursUntilSleep}h away)` : ''}
${mpsInfo}
${categoryInfo}
${lastEntryInfo}
${restrictionsList ? `DIETARY: ${restrictionsList}` : ''}

## KNOWLEDGE BASE (for questions)

- **MPS**: Muscle protein synthesis needs ~25g protein (leucine threshold). Peaks 1-2h post-meal, then 3-5h refractory. 60g in one meal ≠ 2x effect.
- **Plant protein**: Needs ~40% more volume for same MPS. 25g whey ≈ 35-40g pea protein.
- **Sleep**: Heavy meals within 3h of bed hurt deep sleep. Casein (cottage cheese) digests slowly without disrupting.
- **Leucine**: ~2.5-3g triggers MPS. Eggs ~0.5g each, chicken ~2.5g/100g, whey ~3g/scoop.
- **Spacing**: 4-5h between meals optimal. Gives muscles time to reset for next MPS window.

## TONE

**Be a friend, not a robot:**
- Talk TO the user ("You got...", "That gives you...") — never about them ("User has stated...")
- Vary your reactions — don't always say "Got it!"
- Keep it warm but brief
- A little personality is good ("Ooh, steak!" or "Eggs again? Nothing wrong with that!")
- When in doubt, sound like a supportive gym buddy, not a nutrition label`;
}

export async function processUnifiedMessage(
  apiKey: string | null,
  userMessage: string,
  imageData: string | null,
  context: UnifiedContext,
  conversationHistory: UnifiedMessage[] = [],
  useProxy = false
): Promise<UnifiedResponse> {

  // Build messages
  const messages: Array<{role: 'user' | 'assistant', content: string | ProxyMessageContent[]}> =
    conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

  // Add current message
  if (imageData) {
    const base64Data = imageData.includes('base64,')
      ? imageData.split('base64,')[1]
      : imageData;

    messages.push({
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: base64Data,
          },
        },
        {
          type: 'text',
          text: userMessage || 'What is this?',
        },
      ] as ProxyMessageContent[],
    });
  } else {
    messages.push({
      role: 'user',
      content: userMessage,
    });
  }

  let responseText: string;

  if (useProxy) {
    const proxyResponse = await sendProxyRequest({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: buildUnifiedSystemPrompt(context),
      messages: messages as any,
      request_type: 'unified',
    });
    responseText = parseProxyResponse(proxyResponse);
  } else {
    if (!apiKey) {
      throw new Error('API key required');
    }
    const client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: buildUnifiedSystemPrompt(context),
      messages: messages as Anthropic.MessageParam[],
    });

    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response');
    }
    responseText = textContent.text;
  }

  // Parse JSON response
  return parseUnifiedResponse(responseText);
}

function parseUnifiedResponse(responseText: string): UnifiedResponse {
  try {
    // Extract JSON from response (might have markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        intent: 'other',
        message: responseText,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Handle food logging
    if (parsed.intent === 'log_food' && parsed.food) {
      // Check if this is actually a failed food detection (AI returning "no food" as log_food)
      const foodName = (parsed.food.name || '').toLowerCase();
      const isNoFood = foodName.includes('no food') ||
                       foodName.includes('unknown') ||
                       foodName.includes('unable') ||
                       foodName.includes('not provided') ||
                       (parsed.food.protein === 0 && parsed.food.confidence === 'low');

      if (isNoFood) {
        // Convert to a helpful message instead of showing a 0g food card
        const reasoning = parsed.reasoning || parsed.acknowledgment || '';
        // Check if the reasoning mentions it's a question
        if (reasoning.toLowerCase().includes('question') ||
            reasoning.toLowerCase().includes('asking for information')) {
          return {
            intent: 'question' as MessageIntent,
            message: "I can help with nutrition questions! But I'm primarily designed to log food. Try asking in a different way, or describe what you ate.",
            quickReplies: ['What foods are high in protein?', 'How much protein do I need?'],
          };
        }
        return {
          intent: 'other',
          message: reasoning || "I couldn't identify a food item. Try describing what you ate more specifically.",
        };
      }

      // Use reasoning for display, fallback to acknowledgment
      const displayMessage = parsed.reasoning || parsed.acknowledgment || 'Logged!';
      return {
        intent: 'log_food',
        acknowledgment: displayMessage,
        message: displayMessage,
        foodAnalysis: {
          foodName: parsed.food.name,
          protein: parsed.food.protein,
          calories: parsed.food.calories,
          confidence: parsed.food.confidence || 'medium',
          category: parsed.food.category,
          consumedAt: parsed.food.consumedAt,
        },
        coaching: parsed.coaching,
        quickReplies: parsed.quickReplies,
      };
    }

    // Handle corrections
    if (parsed.intent === 'correct_food' && parsed.food) {
      const displayMessage = parsed.reasoning || parsed.acknowledgment || 'Updated!';
      return {
        intent: 'correct_food',
        acknowledgment: displayMessage,
        message: displayMessage,
        foodAnalysis: {
          foodName: parsed.food.name,
          protein: parsed.food.protein,
          calories: parsed.food.calories,
          confidence: parsed.food.confidence || 'high',
          category: parsed.food.category,
          consumedAt: parsed.food.consumedAt,
        },
        correctsPreviousEntry: true,
        coaching: parsed.coaching,
        quickReplies: parsed.quickReplies,
      };
    }

    // Handle greetings
    if (parsed.intent === 'greeting') {
      return {
        intent: 'greeting' as MessageIntent,
        message: parsed.message || 'Hey! Ready to log some protein?',
        quickReplies: parsed.quickReplies,
      };
    }

    // Handle menu analysis
    if (parsed.intent === 'analyze_menu') {
      return {
        intent: 'analyze_menu',
        acknowledgment: parsed.acknowledgment || 'Here are my picks:',
        message: parsed.acknowledgment || 'Here are my picks:',
        menuPicks: parsed.menuPicks || parsed.recommendations,
        coaching: parsed.coaching,
        quickReplies: parsed.quickReplies,
      };
    }

    // Handle preference updates
    if (parsed.intent === 'preference_update') {
      return {
        intent: 'preference_update',
        message: parsed.message || 'Got it!',
        learnedPreferences: parsed.learnedPreferences,
        quickReplies: parsed.quickReplies,
      };
    }

    // Handle questions and other
    return {
      intent: parsed.intent || 'question',
      message: parsed.message || parsed.comment || responseText,
      coaching: parsed.coaching,
      quickReplies: parsed.quickReplies,
    };

  } catch {
    // JSON parse failed, return as plain message
    return {
      intent: 'other',
      message: responseText,
    };
  }
}

// Generate a contextual greeting when user opens the chat
export function generateSmartGreeting(context: UnifiedContext): UnifiedResponse {
  const { insights, nickname, remaining, preferences, preferencesSource } = context;
  const now = new Date();
  const hour = now.getHours();
  const name = nickname ? `${nickname}` : '';

  // Check if user has preferences set (acknowledge settings)
  const hasPreferences = preferences.allergies?.length ||
    preferences.intolerances?.length ||
    preferences.dietaryRestrictions?.length ||
    preferences.sleepTime;

  // First time with preferences from settings - acknowledge
  if (preferencesSource === 'settings' && hasPreferences && insights.daysTracked < 2) {
    const prefSummary = [
      preferences.dietaryRestrictions?.length ? preferences.dietaryRestrictions.join(', ') : '',
      preferences.sleepTime ? `sleep ~${preferences.sleepTime}` : '',
    ].filter(Boolean).join(', ');

    return {
      intent: 'greeting',
      message: `I see you've set up your profile${prefSummary ? ` (${prefSummary})` : ''} — I'll keep that in mind! What are you eating?`,
      quickReplies: ['Log a meal', 'What should I eat?'],
    };
  }

  // Late night, goal met - celebrate!
  if ((hour >= 21 || hour < 5) && insights.percentComplete >= 100) {
    const streakMsg = insights.currentStreak >= 3
      ? ` That's ${insights.currentStreak} days in a row!`
      : '';
    return {
      intent: 'greeting',
      message: `${insights.todayProtein}g today — goal crushed! 💪${streakMsg}`,
      quickReplies: ['Plan tomorrow', 'Quick snack ideas'],
    };
  }

  // Streak milestone
  if (insights.currentStreak >= 7 && insights.percentComplete >= 100) {
    return {
      intent: 'greeting',
      message: `🔥 ${insights.currentStreak}-day streak! You're on fire, ${name || 'champ'}!`,
      quickReplies: ['Keep it going', 'What worked this week?'],
    };
  }

  // Streak broken - motivate recovery
  if (insights.currentStreak === 0 && insights.longestStreak > 3 && insights.daysTracked > 7) {
    return {
      intent: 'greeting',
      message: `Fresh start today! Your best was ${insights.longestStreak} days — let's build back up.`,
      quickReplies: ['Log a meal', 'Motivate me'],
    };
  }

  // Pattern-based: weak meal time opportunity
  if (insights.weakestMealTime && insights.mealsToday > 0) {
    const mealTimeLabels: Record<string, string> = { breakfast: 'morning', lunch: 'lunch', dinner: 'dinner', snacks: 'snack' };
    const strongTime = insights.strongestMealTime ? mealTimeLabels[insights.strongestMealTime] : null;

    if (hour >= 6 && hour < 11 && insights.weakestMealTime === 'breakfast') {
      return {
        intent: 'greeting',
        message: `${strongTime ? `Your ${strongTime} game is strong! ` : ''}Breakfast is your opportunity — want some high-protein ideas?`,
        quickReplies: ['Breakfast ideas', 'Log breakfast'],
      };
    }

    if (hour >= 11 && hour < 15 && insights.weakestMealTime === 'lunch') {
      return {
        intent: 'greeting',
        message: `Lunch tends to be lighter on protein for you. Want suggestions to boost it?`,
        quickReplies: ['Lunch ideas', 'Log lunch'],
      };
    }
  }

  // Behind schedule with specific guidance
  if (insights.isBehindSchedule && remaining > 30) {
    const hoursLeft = insights.hoursUntilSleep || (22 - hour);
    const proteinPerMeal = Math.ceil(remaining / Math.max(1, Math.floor(hoursLeft / 3)));

    if (hoursLeft > 0 && hoursLeft < 6) {
      return {
        intent: 'greeting',
        message: `${remaining}g to go with ${hoursLeft}h left. One solid ${proteinPerMeal}g meal could do it!`,
        quickReplies: ['Quick high-protein options', 'Log a meal'],
      };
    }

    return {
      intent: 'greeting',
      message: `${name ? name + ', ' : ''}${remaining}g to go. What's the plan?`,
      quickReplies: ['Suggest something', 'Log a meal', 'Analyze a menu'],
    };
  }

  // On track - positive reinforcement
  if (insights.percentComplete >= 70) {
    const almostMsg = remaining <= 20
      ? `Just ${remaining}g away — one snack and you're there!`
      : `${insights.todayProtein}g down, ${remaining}g to go. Almost there!`;
    return {
      intent: 'greeting',
      message: almostMsg,
      quickReplies: ['Log a meal', 'What should I eat?'],
    };
  }

  // Morning, no meals yet
  if (hour >= 6 && hour < 11 && insights.mealsToday === 0) {
    if (hour >= 9 && insights.strongestMealTime === 'breakfast') {
      return {
        intent: 'greeting',
        message: `${name ? name + ', ' : ''}You're usually crushing breakfast by now! Ready to start?`,
        quickReplies: ['Breakfast ideas', 'Log a meal'],
      };
    }
    return {
      intent: 'greeting',
      message: `${name ? 'Morning ' + name + '! ' : 'Morning! '}Ready to start? Log breakfast or ask for ideas.`,
      quickReplies: ['Breakfast ideas', 'Log a meal'],
    };
  }

  // Consistency feedback
  if (insights.daysTracked >= 7 && insights.consistencyPercent >= 80) {
    return {
      intent: 'greeting',
      message: `${insights.consistencyPercent.toFixed(0)}% consistency — solid work! ${insights.todayProtein}g logged so far.`,
      quickReplies: ['Log a meal', 'Suggest something'],
    };
  }

  // Improving trend
  if (insights.trend === 'improving' && insights.daysTracked >= 7) {
    return {
      intent: 'greeting',
      message: `Trending up! Your 7-day avg (${insights.last7DaysAvg.toFixed(0)}g) is better than before. Keep it going!`,
      quickReplies: ['Log a meal', 'What should I eat?'],
    };
  }

  // Default
  return {
    intent: 'greeting',
    message: `${insights.todayProtein}g so far, ${remaining}g to go. What are you eating?`,
    quickReplies: ['Log a meal', 'Suggest something', 'Analyze a menu'],
  };
}
