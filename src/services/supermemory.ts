/**
 * Supermemory Service
 * Provides long-term memory storage and retrieval for the Protee app
 * Uses Supermemory's Universal Memory API
 */

import type { FoodEntry, ChatMessage, DietaryPreferences } from '@/types';

const SUPERMEMORY_API_BASE = 'https://api.supermemory.ai/v3';
const SUPERMEMORY_V2_API_BASE = 'https://v2.api.supermemory.ai';

interface SupermemoryDocument {
  customId?: string;
  content: string;
  metadata?: Record<string, string | number | boolean>;
  containerTags?: string[];
}

interface SupermemorySearchResult {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  score?: number;
}

interface SupermemoryAddResponse {
  id: string;
  status: string;
}

interface SupermemorySearchResponse {
  results: SupermemorySearchResult[];
}

/**
 * Get the Supermemory API key from environment
 */
function getApiKey(): string | null {
  // Check for the Claude Code specific key first
  const ccKey = import.meta.env.VITE_SUPERMEMORY_CC_API_KEY;
  if (ccKey) return ccKey;

  // Fall back to generic key
  const key = import.meta.env.VITE_SUPERMEMORY_API_KEY;
  return key || null;
}

/**
 * Add a memory/document to Supermemory
 */
export async function addMemory(
  content: string,
  options: {
    customId?: string;
    metadata?: Record<string, string | number | boolean>;
    containerTags?: string[];
  } = {}
): Promise<SupermemoryAddResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Supermemory API key not configured');
  }

  const document: SupermemoryDocument = {
    content,
    ...options,
  };

  const response = await fetch(`${SUPERMEMORY_API_BASE}/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(document),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supermemory add failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Search memories in Supermemory
 */
export async function searchMemories(
  query: string,
  options: {
    containerTags?: string[];
    limit?: number;
  } = {}
): Promise<SupermemorySearchResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Supermemory API key not configured');
  }

  const searchBody: Record<string, unknown> = {
    q: query,
  };

  if (options.containerTags) {
    searchBody.containerTags = options.containerTags;
  }
  if (options.limit) {
    searchBody.limit = options.limit;
  }

  // Use v2 search endpoint
  const response = await fetch(`${SUPERMEMORY_V2_API_BASE}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(searchBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supermemory search failed: ${response.status} - ${errorText}`);
  }

  const data: SupermemorySearchResponse = await response.json();
  return data.results || [];
}

/**
 * Index a food entry to Supermemory
 */
export async function indexFoodEntry(
  entry: FoodEntry,
  userId?: string
): Promise<SupermemoryAddResponse> {
  const content = formatFoodEntryForMemory(entry);
  const containerTags = userId ? [userId, 'food-entries'] : ['food-entries'];

  return addMemory(content, {
    customId: entry.syncId || `food-${entry.id}`,
    metadata: {
      type: 'food_entry',
      date: entry.date,
      foodName: entry.foodName,
      protein: entry.protein,
      calories: entry.calories || 0,
      confidence: entry.confidence,
      source: entry.source,
    },
    containerTags,
  });
}

/**
 * Index multiple food entries in bulk
 */
export async function indexFoodEntries(
  entries: FoodEntry[],
  userId?: string
): Promise<{ indexed: number; failed: number; errors: string[] }> {
  const results = { indexed: 0, failed: 0, errors: [] as string[] };

  for (const entry of entries) {
    try {
      await indexFoodEntry(entry, userId);
      results.indexed++;
    } catch (error) {
      results.failed++;
      results.errors.push(`Failed to index ${entry.foodName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

/**
 * Index a chat message to Supermemory
 */
export async function indexChatMessage(
  message: ChatMessage,
  userId?: string
): Promise<SupermemoryAddResponse> {
  const content = formatChatMessageForMemory(message);
  const containerTags = userId ? [userId, 'chat-messages'] : ['chat-messages'];

  return addMemory(content, {
    customId: message.syncId,
    metadata: {
      type: 'chat_message',
      messageType: message.type,
      timestamp: message.timestamp.toISOString(),
      hasFoodEntry: !!message.foodEntry,
    },
    containerTags,
  });
}

/**
 * Index dietary preferences to Supermemory
 */
export async function indexDietaryPreferences(
  preferences: DietaryPreferences,
  userId?: string
): Promise<SupermemoryAddResponse> {
  const content = formatDietaryPreferencesForMemory(preferences);
  const containerTags = userId ? [userId, 'preferences'] : ['preferences'];

  return addMemory(content, {
    customId: userId ? `preferences-${userId}` : 'preferences',
    metadata: {
      type: 'dietary_preferences',
    },
    containerTags,
  });
}

/**
 * Search for relevant food history
 */
export async function searchFoodHistory(
  query: string,
  userId?: string,
  limit = 10
): Promise<SupermemorySearchResult[]> {
  const containerTags = userId ? [userId, 'food-entries'] : ['food-entries'];
  return searchMemories(query, { containerTags, limit });
}

/**
 * Search for relevant chat context
 */
export async function searchChatContext(
  query: string,
  userId?: string,
  limit = 5
): Promise<SupermemorySearchResult[]> {
  const containerTags = userId ? [userId, 'chat-messages'] : ['chat-messages'];
  return searchMemories(query, { containerTags, limit });
}

/**
 * Search across all user memories
 */
export async function searchAllMemories(
  query: string,
  userId?: string,
  limit = 10
): Promise<SupermemorySearchResult[]> {
  const containerTags = userId ? [userId] : undefined;
  return searchMemories(query, { containerTags, limit });
}

// Formatting helpers

function formatFoodEntryForMemory(entry: FoodEntry): string {
  const parts = [
    `Food: ${entry.foodName}`,
    `Date: ${entry.date}`,
    `Protein: ${entry.protein}g`,
  ];

  if (entry.calories) {
    parts.push(`Calories: ${entry.calories} kcal`);
  }

  parts.push(`Confidence: ${entry.confidence}`);
  parts.push(`Source: ${entry.source}`);

  if (entry.consumedAt) {
    parts.push(`Consumed at: ${entry.consumedAt.toLocaleTimeString()}`);
  }

  return parts.join('\n');
}

function formatChatMessageForMemory(message: ChatMessage): string {
  const parts = [
    `[${message.type.toUpperCase()}] ${message.content}`,
  ];

  if (message.foodEntry) {
    parts.push(`\nAssociated food: ${message.foodEntry.foodName} (${message.foodEntry.protein}g protein)`);
  }

  return parts.join('');
}

function formatDietaryPreferencesForMemory(prefs: DietaryPreferences): string {
  const parts = ['User dietary preferences:'];

  if (prefs.allergies.length > 0) {
    parts.push(`Allergies: ${prefs.allergies.join(', ')}`);
  }

  if (prefs.intolerances.length > 0) {
    parts.push(`Intolerances: ${prefs.intolerances.join(', ')}`);
  }

  if (prefs.dietaryRestrictions.length > 0) {
    parts.push(`Dietary restrictions: ${prefs.dietaryRestrictions.join(', ')}`);
  }

  if (prefs.dislikes.length > 0) {
    parts.push(`Dislikes: ${prefs.dislikes.join(', ')}`);
  }

  if (prefs.favorites.length > 0) {
    parts.push(`Favorites: ${prefs.favorites.join(', ')}`);
  }

  if (prefs.sleepTime) {
    parts.push(`Sleep time: ${prefs.sleepTime}`);
  }

  if (prefs.additionalNotes) {
    parts.push(`Notes: ${prefs.additionalNotes}`);
  }

  return parts.join('\n');
}

/**
 * Check if Supermemory is configured
 */
export function isSupermemoryConfigured(): boolean {
  return getApiKey() !== null;
}
