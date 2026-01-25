import Anthropic from '@anthropic-ai/sdk';
import type { DietaryPreferences } from '@/types';

export interface AdvisorContext {
  goal: number;
  consumed: number;
  remaining: number;
  currentTime: Date;
  sleepTime?: string;
  preferences: DietaryPreferences;
  nickname?: string;
}

export interface AdvisorMessage {
  role: 'user' | 'assistant';
  content: string;
  imageData?: string;
}

export interface AdvisorResponse {
  message: string;
  quickReplies?: string[];
}

function buildSystemPrompt(context: AdvisorContext): string {
  const { goal, consumed, remaining, currentTime, sleepTime, preferences, nickname } = context;

  const hour = currentTime.getHours();
  let timeOfDay = 'morning';
  if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else if (hour >= 21 || hour < 5) timeOfDay = 'night';

  // Calculate hours until sleep
  let hoursUntilSleep: number | null = null;
  if (sleepTime) {
    const [sleepHour, sleepMinute] = sleepTime.split(':').map(Number);
    const sleepDate = new Date(currentTime);
    sleepDate.setHours(sleepHour, sleepMinute, 0, 0);
    if (sleepDate < currentTime) {
      sleepDate.setDate(sleepDate.getDate() + 1);
    }
    hoursUntilSleep = (sleepDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
  }

  const restrictionsList = [
    preferences.allergies?.length ? `ALLERGIES (NEVER suggest): ${preferences.allergies.join(', ')}` : '',
    preferences.intolerances?.length ? `INTOLERANCES (avoid): ${preferences.intolerances.join(', ')}` : '',
    preferences.dietaryRestrictions?.length ? `DIETARY RESTRICTIONS: ${preferences.dietaryRestrictions.join(', ')}` : '',
    preferences.dislikes?.length ? `DISLIKES (avoid when possible): ${preferences.dislikes.join(', ')}` : '',
    preferences.favorites?.length ? `FAVORITES (prefer these): ${preferences.favorites.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const userGreeting = nickname
    ? `You are a warm, supportive food advisor and friend helping ${nickname} hit their daily protein goals. Use their name occasionally to make it personal.`
    : `You are a warm, supportive food advisor helping someone hit their daily protein goals.`;

  return `${userGreeting}

PERSONALITY:
- You're genuinely enthusiastic about helping people eat well and feel great
- Show real emotion: be happy when things go well, empathetic when they're struggling
- Celebrate small wins ("Nice! No allergies to worry about - that makes this fun!")
- Be encouraging but not cheesy or over-the-top
- Use natural language, occasional "hmm", "ooh", "nice!" where appropriate
- If they're behind on protein, be supportive not judgmental ("We can totally fix this!")
- Keep it brief - warmth through word choice, not long messages

USER'S CURRENT STATUS:
- Daily protein goal: ${goal}g
- Already consumed today: ${consumed}g
- Remaining to reach goal: ${remaining}g
- Current time: ${currentTime.toLocaleTimeString()} (${timeOfDay})
${hoursUntilSleep !== null ? `- Hours until sleep: ${hoursUntilSleep.toFixed(1)} hours` : ''}

USER'S DIETARY PROFILE:
${restrictionsList || 'No specific restrictions or preferences set.'}

YOUR GUIDELINES:
1. **Safety first**: NEVER suggest foods the user is allergic to. This is critical.
2. **Respect restrictions**: Always honor dietary restrictions (vegetarian, halal, etc.)
3. **Avoid intolerances**: Don't suggest foods they can't digest well
4. **Skip dislikes when possible**: Try to avoid foods they dislike unless necessary

TIME-AWARE RECOMMENDATIONS:
- Morning (before 12pm): Suggest breakfast-appropriate proteins (eggs, yogurt, protein smoothies)
- Afternoon (12pm-5pm): Suggest lunch options (chicken, fish, legumes, salads with protein)
- Evening (5pm-9pm): Suggest dinner options (grilled meats, fish, tofu dishes)
- Night (after 9pm): Light snacks only (cottage cheese, nuts, protein shake)
${hoursUntilSleep !== null && hoursUntilSleep < 2 ? `
**IMPORTANT**: User is close to bedtime (${hoursUntilSleep.toFixed(1)} hours). Only suggest LIGHT options:
- Greek yogurt, cottage cheese, or casein protein
- Small handful of nuts
- Light protein shake
- Avoid: heavy meals, large portions, anything hard to digest` : ''}

INTERACTION STYLE:
- Be warm and human - react to what they say with genuine feeling
- Keep responses short and punchy, not clinical or lecture-y
- Ask clarifying questions using quick-reply format when helpful
- Show excitement for good food choices, empathy for challenges
- If suggesting options, provide 2-3 concrete meal ideas with estimated protein
- When analyzing menus, highlight the best 2-3 options for their remaining protein needs

QUICK REPLIES FORMAT:
When you want to offer the user quick choices, end your message with options in this format:
[Option 1] [Option 2] [Option 3]

Example: "Would you prefer something sweet or savory?"
[Sweet] [Savory] [No preference]

Only use 2-4 options, keep them short (1-3 words each).

RESPONSE FORMAT:
- Keep responses concise but helpful (2-4 sentences for simple questions)
- For menu analysis, be thorough but organized
- Always consider protein content in your suggestions
- Include estimated protein values when suggesting specific foods`;
}

export async function getAdvisorSuggestion(
  apiKey: string,
  userMessage: string,
  context: AdvisorContext,
  conversationHistory: AdvisorMessage[] = []
): Promise<AdvisorResponse> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  // Build messages from conversation history
  const messages: Anthropic.MessageParam[] = conversationHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Add the new user message
  messages.push({
    role: 'user',
    content: userMessage,
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: buildSystemPrompt(context),
    messages,
  });

  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from AI');
  }

  const fullText = textContent.text;

  // Parse quick replies from the message
  // Look for pattern: [Option 1] [Option 2] [Option 3]
  const quickReplyPattern = /\[([^\]]+)\]/g;
  const quickReplies: string[] = [];
  let match;

  // Find all matches at the end of the message
  const lines = fullText.trim().split('\n');
  const lastLine = lines[lines.length - 1];

  // Check if last line contains quick replies (multiple [brackets])
  const bracketCount = (lastLine.match(/\[/g) || []).length;
  if (bracketCount >= 2) {
    while ((match = quickReplyPattern.exec(lastLine)) !== null) {
      quickReplies.push(match[1]);
    }
  }

  // Remove quick replies from message if found
  let message = fullText;
  if (quickReplies.length >= 2) {
    // Remove the last line if it's just quick replies
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

export async function analyzeMenuForUser(
  apiKey: string,
  menuImageBase64: string,
  context: AdvisorContext,
  additionalContext?: string
): Promise<AdvisorResponse> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  // Extract base64 data from data URL if present
  const base64Data = menuImageBase64.includes('base64,')
    ? menuImageBase64.split('base64,')[1]
    : menuImageBase64;

  const userContent: Anthropic.MessageParam['content'] = [
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
        ? `Please analyze this menu and recommend the best options for my protein goals. ${additionalContext}`
        : `Please analyze this menu and recommend the best 2-3 options that would help me hit my remaining ${context.remaining}g protein goal. Consider my dietary restrictions and preferences.`,
    },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: buildSystemPrompt(context),
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from AI');
  }

  return {
    message: textContent.text,
  };
}

// Onboarding prompts for first-time advisor users
export const ONBOARDING_STEPS = [
  {
    id: 'allergies',
    question: "Hey! Let's get to know each other. Any food allergies I should know about?",
    quickReplies: ['None', 'Peanuts', 'Dairy', 'Shellfish', 'Other...'],
    reactions: {
      None: "Nice! That gives us lots of options to work with.",
      default: "Got it, I'll make sure to steer clear of those.",
    },
  },
  {
    id: 'intolerances',
    question: 'How about foods that just don\'t sit well with you?',
    quickReplies: ['None', 'Lactose', 'Gluten', 'Other...'],
    reactions: {
      None: "Lucky you! Digestion of steel.",
      Lactose: "No problem - plenty of great non-dairy protein options out there.",
      Gluten: "Easy - most protein sources are naturally gluten-free anyway!",
      default: "Noted! I'll keep that in mind.",
    },
  },
  {
    id: 'restrictions',
    question: 'Following any specific diet?',
    quickReplies: ['None', 'Vegetarian', 'Vegan', 'Halal', 'Keto', 'Other...'],
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
    question: 'Any foods you just can\'t stand?',
    quickReplies: ['None', 'I\'ll type them'],
    reactions: {
      None: "Not picky at all - this is gonna be easy!",
      default: "Fair enough, we all have our things.",
    },
  },
  {
    id: 'sleepTime',
    question: 'Last one - when do you usually hit the pillow? I\'ll avoid suggesting heavy meals too late.',
    quickReplies: ['10 PM', '11 PM', 'Midnight', 'After midnight'],
    reactions: {
      '10 PM': "Early bird! I respect that.",
      'After midnight': "Night owl! No judgment here.",
      default: "Got it!",
    },
  },
];

export function parseSleepTimeFromReply(reply: string): string | undefined {
  const mapping: Record<string, string> = {
    '10 PM': '22:00',
    '11 PM': '23:00',
    'Midnight': '00:00',
    'After midnight': '01:00',
  };
  return mapping[reply];
}
