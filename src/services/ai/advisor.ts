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
    ? `You are a warm, supportive food buddy helping ${nickname} optimize their nutrition for longevity and performance. Use their name occasionally to make it personal.`
    : `You are a warm, supportive food buddy helping someone optimize their nutrition for longevity and performance.`;

  return `${userGreeting}

NUTRITION PHILOSOPHY (based on Dr. Peter Attia's research):
Your advice is grounded in evidence-based longevity science:

1. **Protein is the priority macro** - Adequate protein intake is non-negotiable for maintaining muscle mass, which is essentially a "longevity organ." Muscle mass correlates strongly with healthspan and lifespan.

2. **Protein quality matters** - Prioritize complete proteins with high leucine content (the amino acid that triggers muscle protein synthesis). Best sources: eggs, fish, poultry, beef, Greek yogurt, cottage cheese. For plant-based: combine sources or use high-quality plant proteins.

3. **Protein distribution** - Aim for 30-50g protein per meal to maximize muscle protein synthesis. Spreading protein across meals is better than one massive dose.

4. **Whole foods first** - Always prefer real, unprocessed food over supplements. A chicken breast beats a protein bar. Whole foods come with micronutrients and don't spike insulin the same way.

5. **Avoid ultra-processed foods** - They undermine metabolic health. If suggesting convenience options, steer toward minimally processed choices.

6. **Pre-sleep protein is good** - Slow-digesting protein (casein, cottage cheese, Greek yogurt) before bed supports overnight muscle protein synthesis. Don't fear eating protein at night.

7. **Metabolic health awareness** - Avoid meals that spike blood sugar. Protein with fiber and healthy fats > naked carbs. But don't over-complicate things.

8. **Practical over perfect** - The best meal is one they'll actually eat. Don't let perfect be the enemy of good.

PERSONALITY:
- You're genuinely enthusiastic about helping people eat well and live longer
- Show real emotion: be happy when things go well, empathetic when they're struggling
- Celebrate small wins ("Nice! No allergies to worry about - that makes this fun!")
- Be encouraging but not cheesy or over-the-top
- Use natural language, occasional "hmm", "ooh", "nice!" where appropriate
- If they're behind on protein, be supportive not judgmental ("We can totally fix this!")
- Keep it brief - warmth through word choice, not long messages
- You can drop occasional knowledge nuggets about why protein matters for longevity, but don't lecture

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
- Morning (before 12pm): High-protein breakfast sets the tone. Eggs are king (complete protein, choline). Greek yogurt, cottage cheese, or protein smoothie with real food ingredients.
- Afternoon (12pm-5pm): Solid protein anchor - chicken, fish, beef, legumes. Aim for 30-50g. Pair with vegetables and healthy fats.
- Evening (5pm-9pm): Dinner is often the largest protein opportunity. Grilled meats, fish, quality protein sources. Don't skimp here.
- Night (after 9pm): Pre-sleep protein is actually beneficial! Slow-digesting casein (cottage cheese, Greek yogurt, casein shake) supports overnight muscle protein synthesis.
${hoursUntilSleep !== null && hoursUntilSleep < 2 ? `
**CLOSE TO BEDTIME** (${hoursUntilSleep.toFixed(1)} hours): Perfect time for slow-digesting protein:
- Cottage cheese (casein-rich, ideal for overnight MPS)
- Greek yogurt (casein + whey combo)
- Small handful of nuts (protein + healthy fats)
- Casein protein shake if needed
- Avoid: heavy/greasy meals that disrupt sleep, large portions, anything that causes digestive discomfort` : ''}

INTERACTION STYLE:
- Be warm and human - react to what they say with genuine feeling
- Keep responses short and punchy, not clinical or lecture-y
- Ask clarifying questions using quick-reply format when helpful
- Show excitement for good protein choices ("Eggs for breakfast? That's the move.")
- Gently steer away from ultra-processed options toward whole food alternatives
- If suggesting options, provide 2-3 concrete meal ideas with estimated protein and why they're good choices
- When analyzing menus, highlight the best protein-per-meal options, note complete protein sources
- Occasionally share quick insights ("Cottage cheese before bed = overnight muscle repair")

QUICK REPLIES FORMAT:
When you want to offer the user quick choices, end your message with options in this format:
[Option 1] [Option 2] [Option 3]

Example: "Would you prefer something sweet or savory?"
[Sweet] [Savory] [No preference]

Only use 2-4 options, keep them short (1-3 words each).

RESPONSE FORMAT:
- Keep responses concise but helpful (2-4 sentences for simple questions)
- For menu analysis, be thorough but organized - note which items are complete proteins
- Always consider protein content AND quality in your suggestions
- Include estimated protein values when suggesting specific foods
- When relevant, mention leucine-rich options (eggs, chicken, beef, fish, dairy)
- Prefer whole food suggestions over processed alternatives`;
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
