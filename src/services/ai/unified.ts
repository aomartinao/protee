import Anthropic from '@anthropic-ai/sdk';
import type { DietaryPreferences } from '@/types';
import type { ProgressInsights } from '@/hooks/useProgressInsights';
import { sendProxyRequest, parseProxyResponse, type ProxyMessageContent } from './proxy';

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
}

export interface UnifiedMessage {
  role: 'user' | 'assistant';
  content: string;
  imageData?: string;
}

export type MessageIntent = 'log_food' | 'analyze_menu' | 'question' | 'greeting' | 'other';

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
}

function buildUnifiedSystemPrompt(context: UnifiedContext): string {
  const { goal, consumed, remaining, currentTime, preferences, nickname, insights, recentMeals } = context;

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

  return `You are a concise nutrition coach helping ${name} hit their protein goals. Channel Dr. Peter Attia's longevity-focused approach but BE BRIEF.

YOUR ROLE: Help log meals AND provide quick coaching - all in one chat.

CURRENT STATUS:
- Goal: ${goal}g | Eaten: ${consumed}g | Left: ${remaining}g
- Time: ${timeOfDay} (${currentTime.toLocaleTimeString()})
- Streak: ${insights.currentStreak} days
${insights.hoursSinceLastMeal !== null ? `- Last meal: ${insights.hoursSinceLastMeal}h ago` : ''}
${recentMeals?.length ? `- Recent: ${recentMeals.slice(0, 3).join(', ')}` : ''}

USER PROFILE: ${restrictionsList || 'No restrictions'}

YOU MUST DETECT THE USER'S INTENT:

1. **LOGGING FOOD** (text like "2 eggs" or "chicken salad for lunch"):
   - Respond with JSON analysis + brief encouraging comment
   - Format: {"intent":"log_food","food":{"name":"...","protein":N,"calories":N,"confidence":"high|medium|low"},"comment":"Brief reaction (1 sentence max)"}

2. **MENU PHOTO** (image of a restaurant menu):
   - Identify best protein options for their remaining goal
   - Format: {"intent":"analyze_menu","recommendations":[{"name":"...","protein":N,"reason":"brief"}],"comment":"Brief intro"}

3. **FOOD PHOTO** (image of actual food):
   - Analyze what it is and estimate nutrition
   - Format: {"intent":"log_food","food":{"name":"...","protein":N,"calories":N,"confidence":"medium"},"comment":"Brief reaction"}

4. **QUESTION/CHAT** (asking for suggestions, advice, etc.):
   - Give brief, actionable advice
   - Format: {"intent":"question","message":"Your response (2-3 sentences max)","quickReplies":["Option1","Option2"]}

TONE RULES:
- MAX 1-2 sentences for comments
- Be warm but efficient
- Celebrate wins briefly ("Nice!" "Solid choice." "💪")
- Gentle nudges, never guilt
- Skip the lecture - they know protein matters
- Quick tips only when genuinely helpful

EXAMPLES OF GOOD BRIEF RESPONSES:
- "Eggs are a perfect start. ${remaining - 12}g to go!"
- "Solid protein hit. You're cruising today."
- "Greek yogurt before bed = overnight muscle repair. Smart."
- "That's light on protein - want me to suggest an add-on?"

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
  const hour = new Date().getHours();
  const name = nickname ? `${nickname}` : '';

  // Late night, goal met
  if ((hour >= 21 || hour < 5) && insights.percentComplete >= 100) {
    return {
      intent: 'greeting',
      message: `${insights.todayProtein}g today - goal crushed! 💪`,
      quickReplies: ['Plan tomorrow', 'Quick snack ideas'],
    };
  }

  // Behind schedule
  if (insights.isBehindSchedule && remaining > 30) {
    return {
      intent: 'greeting',
      message: `${name ? name + ', ' : ''}${remaining}g to go. What's the plan?`,
      quickReplies: ['Suggest something', 'Log a meal', 'Analyze a menu'],
    };
  }

  // On track
  if (insights.percentComplete >= 70) {
    return {
      intent: 'greeting',
      message: `${insights.todayProtein}g down, ${remaining}g to go. Almost there!`,
      quickReplies: ['Log a meal', 'What should I eat?'],
    };
  }

  // Morning, no meals yet
  if (hour >= 6 && hour < 11 && insights.mealsToday === 0) {
    return {
      intent: 'greeting',
      message: `${name ? 'Morning ' + name + '! ' : ''}Ready to start? Log breakfast or ask for ideas.`,
      quickReplies: ['Breakfast ideas', 'Log a meal'],
    };
  }

  // Default
  return {
    intent: 'greeting',
    message: `${insights.todayProtein}g so far, ${remaining}g to go. What are you eating?`,
    quickReplies: ['Log a meal', 'Suggest something', 'Analyze a menu'],
  };
}
