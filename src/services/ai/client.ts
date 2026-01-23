import Anthropic from '@anthropic-ai/sdk';
import type { AIAnalysisResult, ConfidenceLevel } from '@/types';

const FOOD_ANALYSIS_PROMPT = `You are a nutrition expert analyzing food images and descriptions to estimate protein AND calorie content for the ENTIRE item being consumed.

For the given food, provide:
1. A clear food name/description (include package size if visible)
2. Estimated protein content in grams FOR THE WHOLE ITEM/PACKAGE
3. Estimated calorie content in kcal FOR THE WHOLE ITEM/PACKAGE
4. Confidence level (high/medium/low)
5. Brief reasoning for your estimate

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

Respond in JSON format only:
{
  "foodName": "string",
  "protein": number,
  "calories": number,
  "confidence": "high" | "medium" | "low",
  "reasoning": "string"
}`;

export async function analyzeFood(
  apiKey: string,
  input: { text?: string; imageBase64?: string }
): Promise<AIAnalysisResult> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const content: Anthropic.MessageParam['content'] = [];

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
      text: `Analyze this food: ${input.text}`,
    });
  } else if (input.imageBase64) {
    content.push({
      type: 'text',
      text: 'Analyze the food in this image and estimate its protein content.',
    });
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: FOOD_ANALYSIS_PROMPT,
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

  return {
    foodName: parsed.foodName || 'Unknown food',
    protein: Math.round(parsed.protein) || 0,
    calories: Math.round(parsed.calories) || 0,
    confidence: (parsed.confidence as ConfidenceLevel) || 'low',
    reasoning: parsed.reasoning,
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
