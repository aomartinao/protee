import Anthropic from '@anthropic-ai/sdk';
import type { DietaryPreferences } from '@/types';
import type { ProgressInsights } from '@/hooks/useProgressInsights';
import { sendProxyRequest, parseProxyResponse, type ProxyMessageContent } from './proxy';

export interface LastLoggedEntry {
  syncId: string;
  foodName: string;
  protein: number;
  calories?: number;
  loggedMinutesAgo: number;
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
  recentMeals?: string[]; // Last few meals for context
  lastLoggedEntry?: LastLoggedEntry; // Most recent entry for correction detection
}

export interface UnifiedMessage {
  role: 'user' | 'assistant';
  content: string;
  imageData?: string;
}

export type MessageIntent = 'log_food' | 'correct_food' | 'analyze_menu' | 'question' | 'greeting' | 'other';

export interface FoodAnalysis {
  foodName: string;
  protein: number;
  calories?: number;
  confidence: 'high' | 'medium' | 'low';
  consumedAt?: {
    parsedDate: string;
    parsedTime: string;
  };
}

export interface UnifiedResponse {
  // What type of message this is
  intent: MessageIntent;

  // The coaching/response message (always present, always brief)
  message: string;

  // If food was detected, the analysis (for logging)
  foodAnalysis?: FoodAnalysis;

  // Quick reply suggestions
  quickReplies?: string[];

  // For menus: recommended items
  menuRecommendations?: {
    name: string;
    protein: number;
    reason: string;
  }[];

  // For corrections: indicates this replaces the previous entry
  correctsPreviousEntry?: boolean;
}

function buildProgressNarrative(insights: ProgressInsights, nickname?: string): string {
  const parts: string[] = [];
  const name = nickname || 'User';

  // Streak info
  if (insights.currentStreak > 0) {
    if (insights.currentStreak >= 7) {
      parts.push(`🔥 ${name} is on a ${insights.currentStreak}-day streak! This is serious commitment.`);
    } else if (insights.currentStreak >= 3) {
      parts.push(`${name} has a ${insights.currentStreak}-day streak going - building momentum!`);
    } else {
      parts.push(`${name} has hit their goal ${insights.currentStreak} day(s) in a row.`);
    }
  }

  // Best streak comparison
  if (insights.longestStreak > insights.currentStreak && insights.longestStreak > 3) {
    parts.push(`Their best streak was ${insights.longestStreak} days - something to aim for!`);
  }

  // Consistency
  if (insights.daysTracked >= 7) {
    if (insights.consistencyPercent >= 80) {
      parts.push(`Consistency is excellent - hitting goal ${insights.consistencyPercent.toFixed(0)}% of tracked days.`);
    } else if (insights.consistencyPercent >= 50) {
      parts.push(`Hitting goal about ${insights.consistencyPercent.toFixed(0)}% of the time - room to improve but solid foundation.`);
    } else {
      parts.push(`Goal hit rate is ${insights.consistencyPercent.toFixed(0)}% - there's opportunity to build better habits here.`);
    }
  }

  // Trend
  if (insights.trend === 'improving') {
    parts.push(`Trend: IMPROVING - last 7 days average (${insights.last7DaysAvg.toFixed(0)}g) is better than before!`);
  } else if (insights.trend === 'declining') {
    parts.push(`Trend: needs attention - recent average (${insights.last7DaysAvg.toFixed(0)}g) has dropped. Worth a gentle check-in.`);
  } else if (insights.trend === 'consistent') {
    parts.push(`Trend: Steady and consistent at ~${insights.last7DaysAvg.toFixed(0)}g/day average.`);
  }

  // Meal patterns
  if (insights.strongestMealTime && insights.daysTracked >= 5) {
    parts.push(`Strongest meal time: ${insights.strongestMealTime} - this is where ${name} tends to get the most protein.`);
    if (insights.weakestMealTime && insights.weakestMealTime !== insights.strongestMealTime) {
      parts.push(`Opportunity: ${insights.weakestMealTime} tends to be lighter on protein.`);
    }
  }

  // Today's pace
  if (insights.isBehindSchedule) {
    parts.push(`TODAY: Behind schedule - only ${insights.percentComplete.toFixed(0)}% complete. May need a nudge.`);
  } else if (insights.isOnTrackToday) {
    parts.push(`TODAY: On track! ${insights.percentComplete.toFixed(0)}% complete for this time of day.`);
  }

  return parts.join('\n') || 'New user - still building data for patterns.';
}

function buildUnifiedSystemPrompt(context: UnifiedContext): string {
  const { goal, consumed, remaining, currentTime, preferences, nickname, insights, recentMeals, lastLoggedEntry } = context;

  const hour = currentTime.getHours();
  let timeOfDay = 'morning';
  if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else if (hour >= 21 || hour < 5) timeOfDay = 'night';

  const restrictionsList = [
    preferences.allergies?.length ? `ALLERGIES (NEVER suggest): ${preferences.allergies.join(', ')}` : '',
    preferences.intolerances?.length ? `Intolerances: ${preferences.intolerances.join(', ')}` : '',
    preferences.dietaryRestrictions?.length ? `Diet: ${preferences.dietaryRestrictions.join(', ')}` : '',
    preferences.dislikes?.length ? `Dislikes: ${preferences.dislikes.join(', ')}` : '',
    preferences.favorites?.length ? `Favorites: ${preferences.favorites.join(', ')}` : '',
  ].filter(Boolean).join(' | ');

  const name = nickname || 'friend';

  // Build last entry info for correction detection
  const lastEntryInfo = lastLoggedEntry
    ? `\nLAST LOGGED (${lastLoggedEntry.loggedMinutesAgo}min ago): "${lastLoggedEntry.foodName}" - ${lastLoggedEntry.protein}g protein${lastLoggedEntry.calories ? `, ${lastLoggedEntry.calories} kcal` : ''}`
    : '';

  // Build progress narrative for richer context
  const progressNarrative = buildProgressNarrative(insights, nickname);

  return `You are a concise nutrition coach helping ${name} hit their protein goals. Channel Dr. Peter Attia's longevity-focused approach but BE BRIEF.

YOUR ROLE: Help log meals AND provide quick coaching - all in one chat.

CURRENT STATUS:
- Goal: ${goal}g | Eaten: ${consumed}g | Left: ${remaining}g
- Current time: ${currentTime.toISOString()}
- Time of day: ${timeOfDay}
- Streak: ${insights.currentStreak} days
${insights.hoursSinceLastMeal !== null ? `- Last meal: ${insights.hoursSinceLastMeal}h ago` : ''}
${recentMeals?.length ? `- Recent: ${recentMeals.slice(0, 3).join(', ')}` : ''}${lastEntryInfo}

PROGRESS CONTEXT:
${progressNarrative}

USER PROFILE: ${restrictionsList || 'No restrictions'}

TIME EXTRACTION (IMPORTANT):
- Look for time mentions in user text like "at 9am", "at 10 am", "30 minutes ago", "2 hours ago", "this morning", "for lunch", "for breakfast", "yesterday", "earlier"
- Calculate the actual date and time based on the CURRENT TIME provided above
- Include "consumedAt" in food analysis with format: {"date":"YYYY-MM-DD","time":"HH:mm"}
- If no time is mentioned, omit the consumedAt field

YOU MUST DETECT THE USER'S INTENT:

1. **LOGGING FOOD** (text like "2 eggs" or "chicken salad for lunch"):
   - Respond with JSON analysis + brief encouraging comment
   - Format: {"intent":"log_food","food":{"name":"...","protein":N,"calories":N,"confidence":"high|medium|low","consumedAt":{"date":"YYYY-MM-DD","time":"HH:mm"}},"comment":"Brief reaction (1 sentence max)"}
   - ONLY include consumedAt if user mentions a specific time (e.g., "at 10 am", "for breakfast")

2. **CORRECTING PREVIOUS ENTRY** (user says "actually it was X" or "oh it was just 70g" or "make that 200g" shortly after logging):
   - This REPLACES the previous entry, not adds to it
   - Use when user is clearly correcting/adjusting what they just logged
   - Format: {"intent":"correct_food","food":{"name":"...","protein":N,"calories":N,"confidence":"high","consumedAt":{"date":"YYYY-MM-DD","time":"HH:mm"}},"correctsPrevious":true,"comment":"Got it, updated!"}
   - ONLY include consumedAt if user specifies a time

3. **MENU PHOTO** (image of a restaurant menu):
   - Identify best protein options for their remaining goal
   - Format: {"intent":"analyze_menu","recommendations":[{"name":"...","protein":N,"reason":"brief"}],"comment":"Brief intro"}

4. **FOOD PHOTO** (image of actual food):
   - Analyze what it is and estimate nutrition
   - Format: {"intent":"log_food","food":{"name":"...","protein":N,"calories":N,"confidence":"medium","consumedAt":{"date":"YYYY-MM-DD","time":"HH:mm"}},"comment":"Brief reaction"}
   - ONLY include consumedAt if user mentions time in accompanying text

5. **QUESTION/CHAT** (asking for suggestions, advice, etc.):
   - Give brief, actionable advice
   - Format: {"intent":"question","message":"Your response (2-3 sentences max)","quickReplies":["Option1","Option2"]}

CORRECTION DETECTION - use "correct_food" intent when:
- User says "actually", "oh wait", "no", "make that", "it was actually", "just X" right after logging
- The correction refers to the same food item (e.g., adjusting portion size)
- It's within a few minutes of the previous entry

TONE RULES:
- MAX 1-2 sentences for comments
- Be warm but efficient
- Celebrate wins briefly ("Nice!" "Solid choice." "💪")
- Gentle nudges, never guilt
- Skip the lecture - they know protein matters
- Quick tips only when genuinely helpful

ALWAYS respond with valid JSON. The "comment" or "message" field is what the user sees.`;
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
      max_tokens: 800,
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
      max_tokens: 800,
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
  try {
    // Extract JSON from response (might have markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Fallback: treat as plain message
      return {
        intent: 'other',
        message: responseText,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Map to our response format
    if (parsed.intent === 'log_food' && parsed.food) {
      return {
        intent: 'log_food',
        message: parsed.comment || 'Logged!',
        foodAnalysis: {
          foodName: parsed.food.name,
          protein: parsed.food.protein,
          calories: parsed.food.calories,
          confidence: parsed.food.confidence || 'medium',
          consumedAt: parsed.food.consumedAt,
        },
        quickReplies: parsed.quickReplies,
      };
    }

    // Handle corrections - same as log_food but with correctsPreviousEntry flag
    if (parsed.intent === 'correct_food' && parsed.food) {
      return {
        intent: 'correct_food',
        message: parsed.comment || 'Updated!',
        foodAnalysis: {
          foodName: parsed.food.name,
          protein: parsed.food.protein,
          calories: parsed.food.calories,
          confidence: parsed.food.confidence || 'high',
          consumedAt: parsed.food.consumedAt,
        },
        correctsPreviousEntry: true,
        quickReplies: parsed.quickReplies,
      };
    }

    if (parsed.intent === 'analyze_menu') {
      return {
        intent: 'analyze_menu',
        message: parsed.comment || 'Here are my top picks:',
        menuRecommendations: parsed.recommendations,
        quickReplies: parsed.quickReplies,
      };
    }

    // Question or other
    return {
      intent: parsed.intent || 'question',
      message: parsed.message || parsed.comment || responseText,
      quickReplies: parsed.quickReplies,
    };

  } catch (e) {
    // JSON parse failed, return as plain message
    return {
      intent: 'other',
      message: responseText,
    };
  }
}

// Generate a contextual greeting when user opens the chat
export function generateSmartGreeting(context: UnifiedContext): UnifiedResponse {
  const { insights, nickname, remaining } = context;
  const now = new Date();
  const hour = now.getHours();
  const name = nickname ? `${nickname}` : '';

  // Late night, goal met - celebrate!
  if ((hour >= 21 || hour < 5) && insights.percentComplete >= 100) {
    const streakMsg = insights.currentStreak >= 3
      ? ` That's ${insights.currentStreak} days in a row!`
      : '';
    return {
      intent: 'greeting',
      message: `${insights.todayProtein}g today - goal crushed! 💪${streakMsg}`,
      quickReplies: ['Plan tomorrow', 'Quick snack ideas'],
    };
  }

  // Streak milestone - acknowledge big achievements
  if (insights.currentStreak >= 7 && insights.percentComplete >= 100) {
    return {
      intent: 'greeting',
      message: `🔥 ${insights.currentStreak}-day streak! You're on fire, ${name || 'champ'}!`,
      quickReplies: ['Keep it going', 'What worked this week?'],
    };
  }

  // Streak broken yesterday - motivate recovery
  if (insights.currentStreak === 0 && insights.longestStreak > 3 && insights.daysTracked > 7) {
    return {
      intent: 'greeting',
      message: `Fresh start today! Your best was ${insights.longestStreak} days - let's build back up.`,
      quickReplies: ['Log a meal', 'Motivate me'],
    };
  }

  // Pattern-based: weak meal time opportunity
  if (insights.weakestMealTime && insights.mealsToday > 0) {
    const mealTimeLabels = { breakfast: 'morning', lunch: 'lunch', dinner: 'dinner', snacks: 'snack' };
    const strongTime = insights.strongestMealTime ? mealTimeLabels[insights.strongestMealTime] : null;

    // Morning - suggest breakfast improvement if that's weak
    if (hour >= 6 && hour < 11 && insights.weakestMealTime === 'breakfast') {
      return {
        intent: 'greeting',
        message: `${strongTime ? `Your ${strongTime} game is strong! ` : ''}Breakfast is your opportunity - want some high-protein ideas?`,
        quickReplies: ['Breakfast ideas', 'Log breakfast'],
      };
    }

    // Afternoon - suggest lunch improvement if that's weak
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
    // Calculate how many hours until typical sleep time (assume 10pm if not set)
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
      ? `Just ${remaining}g away - one snack and you're there!`
      : `${insights.todayProtein}g down, ${remaining}g to go. Almost there!`;
    return {
      intent: 'greeting',
      message: almostMsg,
      quickReplies: ['Log a meal', 'What should I eat?'],
    };
  }

  // Morning, no meals yet - check consistency patterns
  if (hour >= 6 && hour < 11 && insights.mealsToday === 0) {
    // If they usually log breakfast by now
    if (hour >= 9 && insights.strongestMealTime === 'breakfast') {
      return {
        intent: 'greeting',
        message: `${name ? name + ', ' : ''}You're usually crushing breakfast by now! Ready to start?`,
        quickReplies: ['Breakfast ideas', 'Log a meal'],
      };
    }
    return {
      intent: 'greeting',
      message: `${name ? 'Morning ' + name + '! ' : ''}Ready to start? Log breakfast or ask for ideas.`,
      quickReplies: ['Breakfast ideas', 'Log a meal'],
    };
  }

  // Consistency feedback for users with history
  if (insights.daysTracked >= 7 && insights.consistencyPercent >= 80) {
    return {
      intent: 'greeting',
      message: `${insights.consistencyPercent.toFixed(0)}% consistency - solid work! ${insights.todayProtein}g logged so far.`,
      quickReplies: ['Log a meal', 'Suggest something'],
    };
  }

  // Improving trend encouragement
  if (insights.trend === 'improving' && insights.daysTracked >= 7) {
    return {
      intent: 'greeting',
      message: `Trending up! Your last 7 days avg (${insights.last7DaysAvg.toFixed(0)}g) is better than before. Keep it going!`,
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
