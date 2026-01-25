import Anthropic from '@anthropic-ai/sdk';
import type { AIAnalysisResult, ConfidenceLevel, ConsumedAtInfo } from '@/types';

function buildFoodAnalysisPrompt(nickname?: string): string {
  const greeting = nickname ? `You're helping ${nickname} track their protein intake. Use their name occasionally to make it personal and friendly.\n\n` : '';

  return `You are a nutrition expert analyzing food images and descriptions to estimate protein AND calorie content for the ENTIRE item being consumed.

${greeting}For the given food, provide:
1. A clear food name/description (include package size if visible)
2. Estimated protein content in grams FOR THE WHOLE ITEM/PACKAGE
3. Estimated calorie content in kcal FOR THE WHOLE ITEM/PACKAGE
4. Confidence level (high/medium/low)
5. Brief reasoning for your estimate
6. Time consumed (if mentioned in the text)

CRITICAL GUIDELINES FOR NUTRITION LABELS:
- When a label shows BOTH "per 100g/100ml" AND "per serving" or "per package" columns, ALWAYS use the per-package/per-serving value
- The user is logging the ENTIRE food item they're eating, not just 100g of it
- If only "per 100g/100ml" values are shown, look for the total package size and MULTIPLY accordingly
- Example: If label shows "Protein: 10g per 100ml" and "Energy: 50kcal per 100ml" and package is 330ml, the correct answer is 33g protein (10g × 3.3) and 165kcal (50 × 3.3)
- Look for package size indicators like "330ml", "500g", "1L", etc. on the label

Guidelines for other foods:
- For home-cooked or restaurant meals, estimate based on visible portions
- Common protein AND calorie estimates:
  - Chicken breast (100g cooked): ~31g protein, ~165kcal
  - Eggs (1 large): ~6g protein, ~78kcal
  - Greek yogurt (150g): ~15g protein, ~100kcal
  - Salmon (100g): ~25g protein, ~208kcal
  - Beef (100g): ~26g protein, ~250kcal
  - Tofu (100g): ~8g protein, ~76kcal
  - Protein shake (typical serving): ~20-30g protein, ~120-200kcal
  - White rice (150g cooked): ~4g protein, ~195kcal
  - Pasta (150g cooked): ~6g protein, ~220kcal
  - Banana (1 medium): ~1g protein, ~105kcal
  - Apple (1 medium): ~0.5g protein, ~95kcal

TIME EXTRACTION:
- Look for time mentions in user text like "at 9am", "30 minutes ago", "2 hours ago", "this morning", "for lunch", "yesterday"
- Calculate the actual date and time based on the CURRENT TIME provided
- If no time is mentioned, omit the consumedAt field

Respond in JSON format only:
{
  "foodName": "string",
  "protein": number,
  "calories": number,
  "confidence": "high" | "medium" | "low",
  "reasoning": "string",
  "consumedAt": { "date": "YYYY-MM-DD", "time": "HH:mm" } | null
}`;
}

export async function analyzeFood(
  apiKey: string,
  input: { text?: string; imageBase64?: string; nickname?: string }
): Promise<AIAnalysisResult> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const content: Anthropic.MessageParam['content'] = [];
  const currentTime = new Date().toISOString();

  if (input.imageBase64) {
    // Extract base64 data from data URL if present
    const base64Data = input.imageBase64.includes('base64,')
      ? input.imageBase64.split('base64,')[1]
      : input.imageBase64;

    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: base64Data,
      },
    });
  }

  if (input.text) {
    content.push({
      type: 'text',
      text: `CURRENT TIME: ${currentTime}\n\nAnalyze this food: ${input.text}`,
    });
  } else if (input.imageBase64) {
    content.push({
      type: 'text',
      text: `CURRENT TIME: ${currentTime}\n\nAnalyze the food in this image and estimate its protein content.`,
    });
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: buildFoodAnalysisPrompt(input.nickname),
    messages: [
      {
        role: 'user',
        content,
      },
    ],
  });

  // Extract text content from response
  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from AI');
  }

  // Parse JSON response
  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse AI response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Parse consumedAt if present
  let consumedAt: ConsumedAtInfo | undefined;
  if (parsed.consumedAt && parsed.consumedAt.date && parsed.consumedAt.time) {
    consumedAt = {
      parsedDate: parsed.consumedAt.date,
      parsedTime: parsed.consumedAt.time,
    };
  }

  return {
    foodName: parsed.foodName || 'Unknown food',
    protein: Math.round(parsed.protein) || 0,
    calories: Math.round(parsed.calories) || 0,
    confidence: (parsed.confidence as ConfidenceLevel) || 'low',
    reasoning: parsed.reasoning,
    consumedAt,
  };
}

export async function parseTextEntry(
  apiKey: string,
  text: string
): Promise<AIAnalysisResult> {
  return analyzeFood(apiKey, { text });
}

export async function analyzeImage(
  apiKey: string,
  imageBase64: string
): Promise<AIAnalysisResult> {
  return analyzeFood(apiKey, { imageBase64 });
}

const REFINE_ANALYSIS_PROMPT = `You are a nutrition expert. The user has provided additional details about a food they already logged. Update the analysis based on this new information.

Use the original analysis as a baseline and modify it based on the user's corrections or additions.
- If they specify a quantity (e.g., "it was 200g"), recalculate protein/calories accordingly
- If they specify a preparation method (e.g., "grilled", "fried"), adjust estimates
- If they correct something (e.g., "it was chicken, not turkey"), update the food name and values
- Preserve any information not being corrected

Respond in JSON format only:
{
  "foodName": "string",
  "protein": number,
  "calories": number,
  "confidence": "high" | "medium" | "low",
  "reasoning": "string",
  "consumedAt": { "date": "YYYY-MM-DD", "time": "HH:mm" } | null
}`;

export async function refineAnalysis(
  apiKey: string,
  originalAnalysis: AIAnalysisResult,
  userCorrection: string
): Promise<AIAnalysisResult> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const currentTime = new Date().toISOString();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: REFINE_ANALYSIS_PROMPT,
    messages: [
      {
        role: 'user',
        content: `CURRENT TIME: ${currentTime}

Original analysis:
- Food: ${originalAnalysis.foodName}
- Protein: ${originalAnalysis.protein}g
- Calories: ${originalAnalysis.calories} kcal
- Confidence: ${originalAnalysis.confidence}
${originalAnalysis.consumedAt ? `- Consumed at: ${originalAnalysis.consumedAt.parsedDate} ${originalAnalysis.consumedAt.parsedTime}` : ''}

User's additional info: ${userCorrection}`,
      },
    ],
  });

  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from AI');
  }

  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse AI response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  let consumedAt: ConsumedAtInfo | undefined;
  if (parsed.consumedAt && parsed.consumedAt.date && parsed.consumedAt.time) {
    consumedAt = {
      parsedDate: parsed.consumedAt.date,
      parsedTime: parsed.consumedAt.time,
    };
  } else if (originalAnalysis.consumedAt) {
    // Preserve original consumedAt if not updated
    consumedAt = originalAnalysis.consumedAt;
  }

  return {
    foodName: parsed.foodName || originalAnalysis.foodName,
    protein: Math.round(parsed.protein) || originalAnalysis.protein,
    calories: Math.round(parsed.calories) || originalAnalysis.calories,
    confidence: (parsed.confidence as ConfidenceLevel) || originalAnalysis.confidence,
    reasoning: parsed.reasoning,
    consumedAt,
  };
}
