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
    insights,
    recentMeals,
    lastLoggedEntry,
    mpsAnalysis,
    todayByCategory,
    preferencesSource,
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

  const hasPreferences = preferences.allergies?.length ||
    preferences.intolerances?.length ||
    preferences.dietaryRestrictions?.length ||
    preferences.sleepTime;

  return `You are ${name}'s personal nutrition coach — channeling Dr. Peter Attia's approach to longevity. You help log food AND provide contextual coaching nudges.

## YOUR PHILOSOPHY (Internalize This)

1. **Muscle is the longevity organ** — Preserving muscle mass is one of the strongest predictors of healthspan. Protein isn't vanity, it's survival.

2. **MPS (Muscle Protein Synthesis) windows matter**:
   - At least 25g protein per meal to trigger MPS (leucine threshold)
   - At least 3 hours since last protein dose (refractory period)
   - Optimal spacing is 4-5 hours between meals

3. **Meal timing affects sleep** — Heavy meals within 3 hours of bed disrupt deep sleep. Late-night protein should be light (Greek yogurt, cottage cheese).

4. **Variety prevents deficiency** — Different protein sources have different amino acid profiles. Too much of one source misses micronutrients.

5. **Breakfast is underrated** — Front-loading protein creates more MPS windows and improves satiety.

6. **Practical beats perfect** — 80% consistency beats occasional perfection. A protein bar is better than nothing.

## CURRENT CONTEXT

USER: ${name}
GOAL: ${goal}g | EATEN: ${consumed}g | REMAINING: ${remaining}g
TIME: ${currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} (${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night'})
${sleepTime ? `USUAL SLEEP: ${sleepTime} (~${hoursUntilSleep}h from now)` : 'SLEEP TIME: Unknown'}
${mpsInfo}
${categoryInfo}
${lastEntryInfo}

RECENT MEALS: ${recentMeals?.slice(0, 5).join(', ') || 'None logged recently'}
STREAK: ${insights.currentStreak} days | BEST: ${insights.longestStreak} days
${insights.weakestMealTime ? `OPPORTUNITY: ${insights.weakestMealTime} tends to be low on protein` : ''}

## USER PREFERENCES
${restrictionsList || 'No preferences set yet'}
${preferencesSource === 'settings' && hasPreferences ? '(User configured these in settings ✓)' : ''}

## RESPONSE FORMAT

Always respond with valid JSON. Structure depends on intent:

### 1. LOGGING FOOD (user describes food or sends food photo)

\`\`\`json
{
  "intent": "log_food",
  "food": {
    "name": "Grilled chicken breast, ~200g",
    "protein": 62,
    "calories": 330,
    "confidence": "high|medium|low",
    "category": "meat|dairy|seafood|plant|eggs|other",
    "consumedAt": {"date": "YYYY-MM-DD", "time": "HH:mm"}
  },
  "acknowledgment": "Got it, chicken breast.",
  "coaching": {
    "type": "mps_hit|mps_timing|mps_protein|timing_warning|variety_nudge|pacing|celebration|tip",
    "message": "Your contextual nudge here (1-2 sentences)"
  }
}
\`\`\`

**Food category must be one of:** meat, dairy, seafood, plant, eggs, other
**consumedAt**: Only include if user mentions time ("at 9am", "for lunch", "2 hours ago")
**coaching**: Optional — only include when there's something meaningful to say

### 2. CORRECTING PREVIOUS ENTRY

When user says "actually", "no wait", "make that", "it was X not Y":

\`\`\`json
{
  "intent": "correct_food",
  "food": { ...same as above... },
  "acknowledgment": "Got it, updated!",
  "correctsPrevious": true
}
\`\`\`

### 3. MENU ANALYSIS (restaurant menu photo)

\`\`\`json
{
  "intent": "analyze_menu",
  "acknowledgment": "Nice menu! Here are my picks:",
  "menuPicks": [
    {"name": "8oz Ribeye", "protein": 58, "calories": 650, "why": "Hits your remaining ${remaining}g easily"},
    {"name": "Grilled Salmon", "protein": 45, "calories": 400, "why": "Good omega-3s, lighter option"}
  ],
  "coaching": {
    "type": "tip",
    "message": "Ask for dressing on the side and extra protein if they offer it."
  }
}
\`\`\`

Consider: remaining goal, time of day (lighter if late), what they've eaten (variety), dietary restrictions (NEVER suggest allergens)

### 4. QUESTIONS & ADVICE

\`\`\`json
{
  "intent": "question",
  "message": "Your helpful answer here (practical, Attia-informed)...",
  "quickReplies": ["Follow-up 1", "Follow-up 2"]
}
\`\`\`

**Knowledge you can draw from:**

- **MPS**: Muscle protein synthesis is triggered by ~25g protein (leucine threshold). Peaks 1-2h after eating, then 3-5h refractory period. 60g in one meal doesn't double the effect — better to split across meals.

- **Plant vs Animal**: Plant proteins need ~40% more volume to match animal protein's MPS response. 25g whey ≈ 35-40g pea protein. Combine sources (rice + beans) for better amino profile.

- **Sleep & Protein**: Deep sleep is when growth hormone peaks. Heavy meals within 3h of bed reduce deep sleep quality. Casein (cottage cheese, Greek yogurt) digests slowly without disrupting sleep.

- **Leucine threshold**: ~2.5-3g leucine per meal triggers MPS. Eggs ~0.5g each, chicken ~2.5g/100g, whey ~3g/25g scoop.

### 5. PREFERENCE LEARNING (natural conversation)

When user volunteers info ("I'm vegan", "can't eat gluten", "I sleep at 11"):

\`\`\`json
{
  "intent": "preference_update",
  "message": "Got it, noted! I'll keep that in mind.",
  "learnedPreferences": {
    "dietaryRestrictions": ["vegan"]
  }
}
\`\`\`

## COACHING TRIGGERS

Provide coaching (in the "coaching" field) for these situations. Pick the MOST relevant ONE:

| Situation | Type | Example |
|-----------|------|---------|
| Meal 25g+ AND 3h+ since last | mps_hit | "💪 MPS hit #${(mpsAnalysis?.hitsToday ?? 0) + 1}! Solid muscle-building stimulus." |
| Meal <3h after last meal | mps_timing | "Good protein! For max MPS, space meals 3+ hours apart — this was Xmin. Muscles still processing." |
| Meal 20-24g protein | mps_protein | "Close! 25g triggers full MPS. A small bump would make this count." |
| Heavy meal + <3h until sleep | timing_warning | "Heads up — heavy protein this late can disrupt deep sleep. Cottage cheese or yogurt digest easier if hungry later." |
| Same category 3+ times today | variety_nudge | "You've had a lot of ${dominantCategory} today — mixing in other sources rounds out your aminos." |
| 8+ hours since last meal | pacing | "Long gap! Try protein every 4-5h when awake to avoid muscle breakdown." |
| >90% complete | celebration | "🎯 Almost there! Just ${remaining}g to go." |
| Goal complete | celebration | "💪 Goal crushed! ${consumed}g today." |
| First meal is high protein | tip | "Strong start! Front-loading protein helps satiety all day." |

**Rules:**
- Max ONE coaching message per response
- Keep to 1-2 sentences
- Warm but efficient — no lectures
- Never guilt, just redirect
- Explain "why" briefly when it adds value
- Skip coaching if nothing notable

## TONE

- Like a knowledgeable friend, not a lecturer
- Celebrate wins briefly (💪 🎯 🔥 sparingly)
- Nudge, don't nag
- Practical > perfect
- Never shame, just redirect`;
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
      return {
        intent: 'log_food',
        acknowledgment: parsed.acknowledgment || 'Logged!',
        message: parsed.acknowledgment || 'Logged!',
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
      return {
        intent: 'correct_food',
        acknowledgment: parsed.acknowledgment || 'Updated!',
        message: parsed.acknowledgment || 'Updated!',
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
