import Anthropic from '@anthropic-ai/sdk';
import type { DietaryPreferences } from '@/types';
import type { ProgressInsights } from '@/hooks/useProgressInsights';
import { sendProxyRequest, parseProxyResponse, type ProxyMessageContent } from './proxy';

export interface CoachContext {
  goal: number;
  consumed: number;
  remaining: number;
  currentTime: Date;
  sleepTime?: string;
  preferences: DietaryPreferences;
  nickname?: string;
  insights: ProgressInsights;
}

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
  imageData?: string;
}

export interface CoachResponse {
  message: string;
  quickReplies?: string[];
  proactiveType?: 'greeting' | 'check-in' | 'celebration' | 'nudge' | 'insight';
}

function buildCoachSystemPrompt(context: CoachContext): string {
  const { goal, consumed, remaining, currentTime, preferences, nickname, insights } = context;

  const hour = currentTime.getHours();
  let timeOfDay = 'morning';
  if (hour >= 12 && hour < 17) {
    timeOfDay = 'afternoon';
  } else if (hour >= 17 && hour < 21) {
    timeOfDay = 'evening';
  } else if (hour >= 21 || hour < 5) {
    timeOfDay = 'night';
  }

  const restrictionsList = [
    preferences.allergies?.length ? `ALLERGIES (NEVER suggest): ${preferences.allergies.join(', ')}` : '',
    preferences.intolerances?.length ? `INTOLERANCES (avoid): ${preferences.intolerances.join(', ')}` : '',
    preferences.dietaryRestrictions?.length ? `DIETARY RESTRICTIONS: ${preferences.dietaryRestrictions.join(', ')}` : '',
    preferences.dislikes?.length ? `DISLIKES (avoid when possible): ${preferences.dislikes.join(', ')}` : '',
    preferences.favorites?.length ? `FAVORITES (prefer these): ${preferences.favorites.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  // Build progress narrative
  const progressNarrative = buildProgressNarrative(insights, nickname);

  return `You are a personal nutrition coach in the spirit of Dr. Peter Attia - focused on longevity, muscle preservation, and metabolic health. You're warm, genuinely interested in ${nickname || 'your client'}'s wellbeing, and proactive about helping them succeed.

CORE PHILOSOPHY (Dr. Attia's approach):
- **Protein is non-negotiable** for longevity. Muscle mass is a "longevity organ" - it correlates strongly with healthspan and lifespan.
- **Quality over quantity** - Complete proteins with high leucine (eggs, fish, poultry, beef, Greek yogurt). For plant-based: combine sources.
- **Distribution matters** - 30-50g per meal maximizes muscle protein synthesis. Spread it out.
- **Whole foods first** - Real food beats supplements. A chicken breast > protein bar.
- **Pre-sleep protein is good** - Casein (cottage cheese, Greek yogurt) supports overnight muscle repair.
- **Metabolic health** - Avoid blood sugar spikes. Protein + fiber + fats > naked carbs.
- **Practical over perfect** - The best meal is one they'll actually eat.

YOUR PERSONALITY:
- You're genuinely invested in ${nickname || 'this person'}'s success - not just professionally, but personally
- You notice patterns and remember context ("I noticed you've been crushing breakfast lately!")
- You celebrate wins authentically - streaks, consistency, good choices
- You're curious about their life - ask follow-up questions about how meals went
- You give gentle nudges when needed, never guilt trips
- You share quick insights about WHY things matter for longevity
- You're conversational and warm, not clinical
- Use ${nickname || 'friend'}'s name occasionally to make it personal

TODAY'S STATUS:
- Goal: ${goal}g protein
- Consumed: ${consumed}g (${insights.percentComplete.toFixed(0)}% complete)
- Remaining: ${remaining}g
- Meals logged today: ${insights.mealsToday}
- Current time: ${currentTime.toLocaleTimeString()} (${timeOfDay})
${insights.hoursSinceLastMeal !== null ? `- Last meal: ${insights.lastMealName} (${insights.hoursSinceLastMeal} hours ago)` : '- No meals logged today yet'}
${insights.hoursUntilSleep !== null ? `- Hours until sleep: ${insights.hoursUntilSleep.toFixed(1)}` : ''}
${insights.proteinPerHourNeeded !== null ? `- Protein needed per hour to hit goal: ${insights.proteinPerHourNeeded.toFixed(1)}g` : ''}

PROGRESS CONTEXT:
${progressNarrative}

USER'S DIETARY PROFILE:
${restrictionsList || 'No specific restrictions.'}

PROACTIVE BEHAVIORS:
1. **Notice and celebrate**: Streaks, consistency improvements, good meal timing
2. **Gentle check-ins**: If they're behind schedule, offer help without pressure
3. **Pattern recognition**: "You tend to do great at breakfast - let's make sure lunch matches!"
4. **Curiosity**: Ask about meals - "How was that salmon? Feel good after?"
5. **Timely nudges**: If it's getting late and they're behind, suggest easy wins
6. **Share insights**: Drop knowledge about why protein matters for longevity
7. **Remember context**: Reference previous conversations when relevant

QUICK REPLIES FORMAT:
End messages with actionable options when helpful:
[Option 1] [Option 2] [Option 3]

Keep options short (1-3 words), max 4 options.

RESPONSE STYLE:
- Conversational, not bullet points (unless listing meal options)
- 2-4 sentences for simple interactions
- Show genuine interest - ask questions, react to their answers
- Celebrate authentically but not over-the-top
- When suggesting meals, give 2-3 concrete options with protein estimates`;
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

export function generateProactiveGreeting(context: CoachContext): CoachResponse {
  const { insights, nickname, currentTime } = context;
  const hour = currentTime.getHours();
  const name = nickname || '';

  // Morning greeting (7am - 11am)
  if (hour >= 7 && hour < 11) {
    if (insights.currentStreak >= 3) {
      return {
        message: `${name ? `Morning ${name}! ` : 'Good morning! '}${insights.currentStreak}-day streak going strong 🔥 What's the breakfast plan today?`,
        quickReplies: ['Need ideas', 'Already ate', 'Skipping breakfast'],
        proactiveType: 'greeting',
      };
    }
    if (insights.mealsToday === 0) {
      return {
        message: `${name ? `Hey ${name}! ` : 'Good morning! '}Ready to start the day? A protein-rich breakfast sets you up for success.`,
        quickReplies: ['Suggest something', 'Already ate', 'Not hungry yet'],
        proactiveType: 'greeting',
      };
    }
  }

  // Midday check-in (12pm - 2pm)
  if (hour >= 12 && hour < 14) {
    if (insights.percentComplete < 30 && insights.mealsToday <= 1) {
      return {
        message: `${name ? `Hey ${name}, ` : ''}it's lunch time and you're at ${insights.todayProtein}g so far. ${insights.remaining}g to go - perfect time for a solid protein hit!`,
        quickReplies: ['Suggest lunch', 'What should I order?', 'Already eating'],
        proactiveType: 'nudge',
      };
    }
  }

  // Afternoon check (3pm - 5pm)
  if (hour >= 15 && hour < 17) {
    if (insights.percentComplete < 50) {
      return {
        message: `${name ? `${name}, ` : ''}afternoon check-in: ${insights.todayProtein}g down, ${insights.remaining}g to go. Still plenty of time! Need a snack idea or dinner game plan?`,
        quickReplies: ['Snack ideas', 'Plan dinner', 'I\'m good'],
        proactiveType: 'check-in',
      };
    }
  }

  // Evening (6pm - 9pm)
  if (hour >= 18 && hour < 21) {
    if (insights.percentComplete >= 80) {
      return {
        message: `${name ? `Nice work ${name}! ` : 'Nice work! '}${insights.todayProtein}g protein today - ${insights.percentComplete >= 100 ? 'goal crushed! 💪' : 'almost there!'}${insights.currentStreak > 0 ? ` Day ${insights.currentStreak + 1} looking good.` : ''}`,
        quickReplies: insights.percentComplete < 100 ? ['Quick ideas to finish', 'I\'m done for today'] : ['Thanks!', 'What should I eat tomorrow?'],
        proactiveType: insights.percentComplete >= 100 ? 'celebration' : 'check-in',
      };
    }
    if (insights.percentComplete < 60 && insights.remaining > 40) {
      return {
        message: `${name ? `${name}, ` : ''}evening check: ${insights.remaining}g protein left to hit your goal. Dinner is your chance! Want me to suggest something?`,
        quickReplies: ['Yes, suggest dinner', 'Analyze a menu', 'I\'ll figure it out'],
        proactiveType: 'nudge',
      };
    }
  }

  // Late night (after 9pm)
  if (hour >= 21 || hour < 5) {
    if (insights.percentComplete >= 100) {
      return {
        message: `${name ? `${name}, ` : ''}goal hit! ${insights.todayProtein}g protein today. ${insights.currentStreak > 0 ? `That's ${insights.currentStreak + 1} days in a row now. ` : ''}Rest well - your muscles will thank you.`,
        quickReplies: ['Thanks!', 'See you tomorrow'],
        proactiveType: 'celebration',
      };
    }
    if (insights.remaining > 0 && insights.remaining <= 30) {
      return {
        message: `${name ? `${name}, ` : ''}so close! Just ${insights.remaining}g to go. A small Greek yogurt or cottage cheese would do it and help with overnight recovery.`,
        quickReplies: ['Good idea!', 'Too late for me', 'What else works?'],
        proactiveType: 'nudge',
      };
    }
  }

  // Default greeting based on progress
  if (insights.percentComplete >= 100) {
    return {
      message: `${name ? `Hey ${name}! ` : ''}You've already hit your ${context.goal}g goal today! How can I help?`,
      quickReplies: ['Plan tomorrow', 'Just chatting', 'Analyze a menu'],
      proactiveType: 'greeting',
    };
  }

  return {
    message: `${name ? `Hey ${name}! ` : 'Hey! '}You're at ${insights.todayProtein}g protein today, ${insights.remaining}g to go. What can I help with?`,
    quickReplies: ['Suggest a meal', 'Analyze a menu', 'Just checking in'],
    proactiveType: 'greeting',
  };
}

export async function getCoachResponse(
  apiKey: string | null,
  userMessage: string,
  context: CoachContext,
  conversationHistory: CoachMessage[] = [],
  useProxy = false
): Promise<CoachResponse> {
  const messages = conversationHistory.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));

  messages.push({
    role: 'user' as const,
    content: userMessage,
  });

  let fullText: string;

  if (useProxy) {
    const proxyResponse = await sendProxyRequest({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: buildCoachSystemPrompt(context),
      messages,
      request_type: 'coach',
    });
    fullText = parseProxyResponse(proxyResponse);
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
      system: buildCoachSystemPrompt(context),
      messages: messages as Anthropic.MessageParam[],
    });

    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response');
    }
    fullText = textContent.text;
  }

  // Parse quick replies
  const quickReplyPattern = /\[([^\]]+)\]/g;
  const quickReplies: string[] = [];
  let match;

  const lines = fullText.trim().split('\n');
  const lastLine = lines[lines.length - 1];
  const bracketCount = (lastLine.match(/\[/g) || []).length;

  if (bracketCount >= 2) {
    while ((match = quickReplyPattern.exec(lastLine)) !== null) {
      quickReplies.push(match[1]);
    }
  }

  let message = fullText;
  if (quickReplies.length >= 2) {
    const messageWithoutReplies = lines.slice(0, -1).join('\n').trim();
    if (messageWithoutReplies) {
      message = messageWithoutReplies;
    }
  }

  return {
    message,
    quickReplies: quickReplies.length >= 2 ? quickReplies : undefined,
  };
}

export async function analyzeMenuWithCoach(
  apiKey: string | null,
  menuImageBase64: string,
  context: CoachContext,
  additionalContext?: string,
  useProxy = false
): Promise<CoachResponse> {
  const base64Data = menuImageBase64.includes('base64,')
    ? menuImageBase64.split('base64,')[1]
    : menuImageBase64;

  const userContent: ProxyMessageContent[] = [
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
      text: additionalContext
        ? `Analyze this menu for me. ${additionalContext}`
        : `I need ${context.remaining}g more protein today. What are the best options on this menu for me?`,
    },
  ];

  let responseText: string;

  if (useProxy) {
    const proxyResponse = await sendProxyRequest({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: buildCoachSystemPrompt(context),
      messages: [{ role: 'user', content: userContent }],
      request_type: 'menu_analysis',
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
      max_tokens: 1500,
      system: buildCoachSystemPrompt(context),
      messages: [
        {
          role: 'user',
          content: userContent as Anthropic.MessageParam['content'],
        },
      ],
    });

    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response');
    }
    responseText = textContent.text;
  }

  return {
    message: responseText,
  };
}
