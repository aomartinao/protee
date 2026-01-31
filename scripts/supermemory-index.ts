#!/usr/bin/env npx tsx
/**
 * Supermemory Indexing Script
 *
 * Indexes food entries from Supabase to Supermemory for long-term memory storage.
 *
 * Usage:
 *   npx tsx scripts/supermemory-index.ts
 *
 * Environment Variables:
 *   SUPERMEMORY_CC_API_KEY - Supermemory API key (required)
 *   SUPABASE_URL - Supabase project URL (optional, uses VITE_ prefix fallback)
 *   SUPABASE_SERVICE_KEY - Supabase service role key for server access (optional)
 */

import { createClient } from '@supabase/supabase-js';

const SUPERMEMORY_API_BASE = 'https://api.supermemory.ai/v3';

interface FoodEntry {
  id: number;
  sync_id: string;
  user_id: string;
  date: string;
  source: string;
  food_name: string;
  protein: number;
  calories?: number;
  confidence: string;
  consumed_at?: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}

interface SupermemoryDocument {
  customId?: string;
  content: string;
  metadata?: Record<string, string | number | boolean>;
  containerTags?: string[];
}

function getEnv(key: string, fallback?: string): string | undefined {
  return process.env[key] || process.env[`VITE_${key}`] || fallback;
}

async function addMemory(
  apiKey: string,
  content: string,
  options: {
    customId?: string;
    metadata?: Record<string, string | number | boolean>;
    containerTags?: string[];
  } = {}
): Promise<{ id: string; status: string }> {
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

function formatFoodEntryForMemory(entry: FoodEntry): string {
  const parts = [
    `Food: ${entry.food_name}`,
    `Date: ${entry.date}`,
    `Protein: ${entry.protein}g`,
  ];

  if (entry.calories) {
    parts.push(`Calories: ${entry.calories} kcal`);
  }

  parts.push(`Confidence: ${entry.confidence}`);
  parts.push(`Source: ${entry.source}`);

  if (entry.consumed_at) {
    parts.push(`Consumed at: ${new Date(entry.consumed_at).toLocaleTimeString()}`);
  }

  return parts.join('\n');
}

async function main() {
  console.log('Supermemory Indexing Script');
  console.log('===========================\n');

  // Get API keys
  const supermemoryKey = getEnv('SUPERMEMORY_CC_API_KEY') || getEnv('SUPERMEMORY_API_KEY');
  if (!supermemoryKey) {
    console.error('Error: SUPERMEMORY_CC_API_KEY or SUPERMEMORY_API_KEY environment variable is required');
    process.exit(1);
  }

  const supabaseUrl = getEnv('SUPABASE_URL');
  const supabaseKey = getEnv('SUPABASE_SERVICE_KEY') || getEnv('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) are required');
    console.log('\nTo index data, set these environment variables:');
    console.log('  export SUPABASE_URL=https://your-project.supabase.co');
    console.log('  export SUPABASE_SERVICE_KEY=your-service-key');
    process.exit(1);
  }

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch food entries
  console.log('Fetching food entries from Supabase...');
  const { data: entries, error } = await supabase
    .from('food_entries')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching entries:', error.message);
    process.exit(1);
  }

  if (!entries || entries.length === 0) {
    console.log('No food entries found to index.');
    process.exit(0);
  }

  console.log(`Found ${entries.length} food entries to index.\n`);

  // Index entries
  let indexed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const entry of entries as FoodEntry[]) {
    try {
      const content = formatFoodEntryForMemory(entry);
      const containerTags = [entry.user_id, 'food-entries', 'protee'];

      await addMemory(supermemoryKey, content, {
        customId: entry.sync_id || `food-${entry.id}`,
        metadata: {
          type: 'food_entry',
          date: entry.date,
          foodName: entry.food_name,
          protein: entry.protein,
          calories: entry.calories || 0,
          confidence: entry.confidence,
          source: entry.source,
        },
        containerTags,
      });

      indexed++;
      process.stdout.write(`\rIndexed: ${indexed}/${entries.length}`);
    } catch (err) {
      failed++;
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`${entry.food_name} (${entry.date}): ${errorMsg}`);
    }
  }

  console.log('\n\n===========================');
  console.log('Indexing Complete');
  console.log('===========================');
  console.log(`Total entries: ${entries.length}`);
  console.log(`Indexed: ${indexed}`);
  console.log(`Failed: ${failed}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more errors`);
    }
  }
}

main().catch(console.error);
