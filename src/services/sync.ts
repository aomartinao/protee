/**
 * Sync Service - Robust offline-first sync with Supabase
 *
 * Features:
 * - Delta sync: Only sync changes since last sync
 * - Last-write-wins conflict resolution using server timestamps
 * - Soft deletes for proper sync across devices
 * - Auto-sync on changes and periodically
 * - Efficient data transfer (only modified entries)
 */

// Chat sync settings - time-based for consistency across devices
const CHAT_SYNC_DAYS = 14;      // Sync window: 2 weeks (matches display)
// Note: Cloud cleanup (30 days) should be handled by a Supabase scheduled function
// to avoid accumulating old messages indefinitely

import { getSupabase, isSupabaseConfigured } from './supabase';
import {
  db,
  getSyncMeta,
  setSyncMeta,
  getAllEntriesForSync,
  upsertEntryBySyncId,
  getEntryBySyncId,
  getUserSettings,
  saveUserSettings,
  getAllChatMessagesForSync,
  getChatMessageBySyncId,
  upsertChatMessageBySyncId,
  getAllDailyGoalsForSync,
  getDailyGoalBySyncId,
  upsertDailyGoalBySyncId,
  markEntrySynced,
  markEntryFailed,
  getPendingSyncCount,
} from '@/db';
import type { FoodEntry, UserSettings, ChatMessage, DailyGoal } from '@/types';

// Debug logging - only in development
const isDev = import.meta.env.DEV;
const syncDebug = (...args: unknown[]) => {
  if (isDev) {
    console.log('[Sync]', ...args);
  }
};

// Sync result interface
export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  settingsSynced?: boolean;
  messagesPushed?: number;
  messagesPulled?: number;
  goalsPushed?: number;
  goalsPulled?: number;
  error?: string;
}

// Database types for Supabase
interface DbFoodEntry {
  id: string;
  user_id: string;
  sync_id: string;
  date: string;
  source: string;
  food_name: string;
  protein: number;
  calories: number | null;
  confidence: string;
  image_data: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface DbChatMessage {
  id: string;
  user_id: string;
  sync_id: string;
  type: string;
  content: string;
  food_entry_sync_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface DbDailyGoal {
  id: string;
  user_id: string;
  sync_id: string;
  date: string;
  goal: number;
  calorie_goal: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Check if we can actually reach Supabase (not just browser online status)
 * Returns true if we can connect, false otherwise
 */
export async function checkConnectivity(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    // Simple health check - try to get session (lightweight operation)
    const { error } = await supabase.auth.getSession();
    return !error;
  } catch {
    return false;
  }
}

/**
 * Get count of entries pending sync
 */
export async function getUnsyncedCount(): Promise<number> {
  return getPendingSyncCount();
}

// Helper to safely convert to Date
function toDate(value: Date | string | undefined | null): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  return new Date(value);
}

// Helper to safely convert Date to ISO string
function toISOString(value: Date | string | undefined | null): string {
  return toDate(value).toISOString();
}

// Convert local FoodEntry to database format
function toDbEntry(entry: FoodEntry, userId: string): Omit<DbFoodEntry, 'id'> {
  const syncId = entry.syncId || crypto.randomUUID();
  const createdAt = toISOString(entry.createdAt);
  const updatedAt = toISOString(entry.updatedAt || entry.createdAt);
  const deletedAt = entry.deletedAt ? toISOString(entry.deletedAt) : null;

  syncDebug('toDbEntry:', {
    syncId,
    foodName: entry.foodName,
    createdAt,
    updatedAt,
    deletedAt,
  });

  return {
    user_id: userId,
    sync_id: syncId,
    date: entry.date,
    source: entry.source,
    food_name: entry.foodName,
    protein: entry.protein,
    calories: entry.calories ?? null,
    confidence: entry.confidence,
    image_data: entry.imageData ?? null,
    created_at: createdAt,
    updated_at: updatedAt,
    deleted_at: deletedAt,
  };
}

// Convert database format to local FoodEntry
function fromDbEntry(dbEntry: DbFoodEntry): Omit<FoodEntry, 'id'> {
  return {
    syncId: dbEntry.sync_id,
    date: dbEntry.date,
    source: dbEntry.source as FoodEntry['source'],
    foodName: dbEntry.food_name,
    protein: dbEntry.protein,
    calories: dbEntry.calories ?? undefined,
    confidence: dbEntry.confidence as FoodEntry['confidence'],
    imageData: dbEntry.image_data ?? undefined,
    createdAt: new Date(dbEntry.created_at),
    updatedAt: new Date(dbEntry.updated_at),
    deletedAt: dbEntry.deleted_at ? new Date(dbEntry.deleted_at) : undefined,
  };
}

/**
 * Push local changes to cloud
 * Only pushes entries modified since last push
 */
async function pushToCloud(userId: string, lastPushTime: Date | null): Promise<{ success: boolean; count: number; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, count: 0, error: 'Supabase not configured' };
  }

  try {
    // Get all local entries (we need to check each one)
    const localEntries = await getAllEntriesForSync();
    syncDebug('Push: Found', localEntries.length, 'local entries, lastPushTime:', lastPushTime);

    // Filter to entries that need pushing (modified after last push)
    // Entries without updatedAt are treated as needing push
    const entriesToPush = lastPushTime
      ? localEntries.filter(e => {
          if (!e.updatedAt) return true;
          // Ensure updatedAt is a Date object
          const updatedAt = e.updatedAt instanceof Date ? e.updatedAt : new Date(e.updatedAt);
          return updatedAt > lastPushTime;
        })
      : localEntries;

    syncDebug('Push: Pushing', entriesToPush.length, 'entries');

    if (entriesToPush.length === 0) {
      return { success: true, count: 0 };
    }

    let pushedCount = 0;
    const errors: string[] = [];

    // Upsert each entry
    for (const entry of entriesToPush) {
      try {
        const dbEntry = toDbEntry(entry, userId);
        syncDebug('Push: Upserting entry to Supabase:', dbEntry.sync_id, dbEntry.food_name);

        const { data, error } = await supabase
          .from('food_entries')
          .upsert(dbEntry, {
            onConflict: 'user_id,sync_id',
          })
          .select();

        if (error) {
          console.error('[Sync] Push error for entry:', entry.syncId, error);
          errors.push(`${entry.syncId}: ${error.message}`);
          // Mark entry as failed so user knows it didn't sync
          if (entry.syncId) {
            await markEntryFailed(entry.syncId);
          }
        } else {
          syncDebug('Push: Successfully upserted entry:', entry.syncId, 'response:', data);
          pushedCount++;
          // Mark entry as synced
          if (entry.syncId) {
            await markEntrySynced(entry.syncId);
          }
        }
      } catch (err) {
        console.error('[Sync] Push exception for entry:', entry.syncId, err);
        errors.push(`${entry.syncId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        // Mark entry as failed
        if (entry.syncId) {
          await markEntryFailed(entry.syncId);
        }
      }
    }

    if (errors.length > 0) {
      console.error('[Sync] Push completed with errors:', errors);
    }

    // Verify push by querying what's in the cloud
    const { data: cloudData, error: verifyError } = await supabase
      .from('food_entries')
      .select('sync_id, food_name, updated_at')
      .eq('user_id', userId);

    if (verifyError) {
      console.error('[Sync] Push verification failed:', verifyError);
    } else {
      syncDebug('Push verification - entries in cloud:', cloudData?.length, cloudData?.map(e => ({ syncId: e.sync_id, name: e.food_name })));
    }

    return { success: true, count: pushedCount };
  } catch (err) {
    return {
      success: false,
      count: 0,
      error: err instanceof Error ? err.message : 'Push failed',
    };
  }
}

/**
 * Pull changes from cloud
 * Only pulls entries modified since last pull (delta sync)
 */
async function pullFromCloud(userId: string, lastPullTime: Date | null): Promise<{ success: boolean; count: number; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, count: 0, error: 'Supabase not configured' };
  }

  try {
    syncDebug('Pull: Fetching entries for user:', userId, 'lastPullTime:', lastPullTime);

    // First, check total count in cloud for this user (without timestamp filter)
    const { count: totalCount, error: countError } = await supabase
      .from('food_entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.error('[Sync] Pull: Error getting total count:', countError);
    } else {
      syncDebug('Pull: Total entries in cloud for user:', totalCount);
    }

    // Build query - get entries modified since last pull
    let query = supabase
      .from('food_entries')
      .select('*')
      .eq('user_id', userId);

    // Delta sync: only get changes since last pull
    // Use gte (>=) and subtract a buffer to avoid missing entries due to:
    // 1. Exact timestamp matches being excluded by gt (>)
    // 2. Clock drift between devices
    if (lastPullTime) {
      const bufferMs = 5000; // 5 second buffer for clock drift
      const adjustedTime = new Date(lastPullTime.getTime() - bufferMs);
      query = query.gte('updated_at', adjustedTime.toISOString());
    }

    const { data: cloudEntries, error } = await query;

    if (error) {
      console.error('[Sync] Pull error:', error);
      return { success: false, count: 0, error: error.message };
    }

    syncDebug('Pull: Received', cloudEntries?.length || 0, 'entries from cloud');

    if (!cloudEntries || cloudEntries.length === 0) {
      return { success: true, count: 0 };
    }

    let pulledCount = 0;

    // Process each cloud entry
    for (const cloudEntry of cloudEntries as DbFoodEntry[]) {
      const localEntry = await getEntryBySyncId(cloudEntry.sync_id);
      const cloudUpdatedAt = new Date(cloudEntry.updated_at);

      // Last-write-wins: cloud entry is newer or doesn't exist locally
      // Ensure localUpdatedAt is a Date object for proper comparison
      let localUpdatedAt = new Date(0);
      if (localEntry?.updatedAt) {
        localUpdatedAt = localEntry.updatedAt instanceof Date
          ? localEntry.updatedAt
          : new Date(localEntry.updatedAt);
      }

      if (!localEntry || cloudUpdatedAt > localUpdatedAt) {
        syncDebug('Pull: Upserting entry', cloudEntry.sync_id, 'local exists:', !!localEntry);
        const entryData = fromDbEntry(cloudEntry);
        await upsertEntryBySyncId({
          ...entryData,
          id: localEntry?.id, // Preserve local ID if exists
        } as FoodEntry);
        pulledCount++;
      }
    }

    syncDebug('Pull: Upserted', pulledCount, 'entries');
    return { success: true, count: pulledCount };
  } catch (err) {
    console.error('[Sync] Pull exception:', err);
    return {
      success: false,
      count: 0,
      error: err instanceof Error ? err.message : 'Pull failed',
    };
  }
}

// Convert local ChatMessage to database format
function chatMessageToDb(message: ChatMessage, userId: string): Omit<DbChatMessage, 'id'> {
  return {
    user_id: userId,
    sync_id: message.syncId,
    type: message.type,
    content: message.content,
    food_entry_sync_id: message.foodEntrySyncId ?? null,
    created_at: toISOString(message.timestamp),
    updated_at: toISOString(message.updatedAt || message.timestamp),
    deleted_at: message.deletedAt ? toISOString(message.deletedAt) : null,
  };
}

// Convert database format to local ChatMessage
function chatMessageFromDb(dbMessage: DbChatMessage): Omit<ChatMessage, 'id'> {
  return {
    syncId: dbMessage.sync_id,
    type: dbMessage.type as ChatMessage['type'],
    content: dbMessage.content,
    foodEntrySyncId: dbMessage.food_entry_sync_id ?? undefined,
    timestamp: new Date(dbMessage.created_at),
    updatedAt: new Date(dbMessage.updated_at),
    deletedAt: dbMessage.deleted_at ? new Date(dbMessage.deleted_at) : undefined,
  };
}

/**
 * Push chat messages to cloud
 * Only pushes messages modified since last push
 * Does NOT sync imageData (it's already in food entries)
 */
async function pushChatMessagesToCloud(
  userId: string,
  lastPushTime: Date | null
): Promise<{ success: boolean; count: number; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, count: 0, error: 'Supabase not configured' };
  }

  try {
    const localMessages = await getAllChatMessagesForSync();

    // Filter to messages within sync window (14 days) and modified after last push
    const syncCutoff = new Date();
    syncCutoff.setDate(syncCutoff.getDate() - CHAT_SYNC_DAYS);

    const messagesToPush = localMessages.filter(m => {
      // Only sync messages within the sync window
      const timestamp = m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp || 0);
      if (timestamp < syncCutoff) return false;

      // If we have a last push time, only push modified messages
      if (lastPushTime) {
        const updatedAt = m.updatedAt instanceof Date ? m.updatedAt : new Date(m.updatedAt || 0);
        return updatedAt > lastPushTime;
      }
      return true;
    });

    syncDebug('Chat Push: Pushing', messagesToPush.length, 'messages');

    if (messagesToPush.length === 0) {
      return { success: true, count: 0 };
    }

    let pushedCount = 0;

    for (const message of messagesToPush) {
      try {
        const dbMessage = chatMessageToDb(message, userId);

        const { error } = await supabase
          .from('chat_messages')
          .upsert(dbMessage, { onConflict: 'user_id,sync_id' });

        if (error) {
          console.error('[Sync] Chat Push error:', message.syncId, error);
        } else {
          pushedCount++;
        }
      } catch (err) {
        console.error('[Sync] Chat Push exception:', message.syncId, err);
      }
    }

    return { success: true, count: pushedCount };
  } catch (err) {
    return {
      success: false,
      count: 0,
      error: err instanceof Error ? err.message : 'Chat push failed',
    };
  }
}

/**
 * Pull chat messages from cloud
 * Only pulls messages modified since last pull (delta sync)
 */
async function pullChatMessagesFromCloud(
  userId: string,
  lastPullTime: Date | null
): Promise<{ success: boolean; count: number; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, count: 0, error: 'Supabase not configured' };
  }

  try {
    // Calculate sync window cutoff (14 days)
    const syncCutoff = new Date();
    syncCutoff.setDate(syncCutoff.getDate() - CHAT_SYNC_DAYS);

    let query = supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', syncCutoff.toISOString())  // Only messages within sync window
      .order('created_at', { ascending: false });

    if (lastPullTime) {
      // Use gte with buffer to avoid missing entries due to clock drift
      const bufferMs = 5000;
      const adjustedTime = new Date(lastPullTime.getTime() - bufferMs);
      query = query.gte('updated_at', adjustedTime.toISOString());
    }

    const { data: cloudMessages, error } = await query;

    if (error) {
      console.error('[Sync] Chat Pull error:', error);
      return { success: false, count: 0, error: error.message };
    }

    syncDebug('Chat Pull: Received', cloudMessages?.length || 0, 'messages');

    if (!cloudMessages || cloudMessages.length === 0) {
      return { success: true, count: 0 };
    }

    let pulledCount = 0;

    for (const cloudMessage of cloudMessages as DbChatMessage[]) {
      const localMessage = await getChatMessageBySyncId(cloudMessage.sync_id);
      const cloudUpdatedAt = new Date(cloudMessage.updated_at);

      // Last-write-wins: cloud message is newer or doesn't exist locally
      let localUpdatedAt = new Date(0);
      if (localMessage?.updatedAt) {
        localUpdatedAt = localMessage.updatedAt instanceof Date
          ? localMessage.updatedAt
          : new Date(localMessage.updatedAt);
      }

      if (!localMessage || cloudUpdatedAt > localUpdatedAt) {
        const messageData = chatMessageFromDb(cloudMessage);
        await upsertChatMessageBySyncId({
          ...messageData,
          id: localMessage?.id,
        } as ChatMessage);
        pulledCount++;
      }
    }

    syncDebug('Chat Pull: Upserted', pulledCount, 'messages');
    return { success: true, count: pulledCount };
  } catch (err) {
    console.error('[Sync] Chat Pull exception:', err);
    return {
      success: false,
      count: 0,
      error: err instanceof Error ? err.message : 'Chat pull failed',
    };
  }
}

/**
 * Sync chat messages bidirectionally
 */
async function syncChatMessages(
  userId: string,
  lastPushTime: Date | null,
  lastPullTime: Date | null
): Promise<{ pushed: number; pulled: number }> {
  // Push first
  const pushResult = await pushChatMessagesToCloud(userId, lastPushTime);
  if (!pushResult.success) {
    console.error('[Sync] Chat push failed:', pushResult.error);
  }

  // Then pull
  const pullResult = await pullChatMessagesFromCloud(userId, lastPullTime);
  if (!pullResult.success) {
    console.error('[Sync] Chat pull failed:', pullResult.error);
  }

  return {
    pushed: pushResult.count,
    pulled: pullResult.count,
  };
}

// Convert local DailyGoal to database format
function dailyGoalToDb(goal: DailyGoal, userId: string): Omit<DbDailyGoal, 'id'> {
  return {
    user_id: userId,
    sync_id: goal.syncId || crypto.randomUUID(),
    date: goal.date,
    goal: goal.goal,
    calorie_goal: goal.calorieGoal ?? null,
    created_at: new Date().toISOString(),
    updated_at: toISOString(goal.updatedAt || new Date()),
    deleted_at: goal.deletedAt ? toISOString(goal.deletedAt) : null,
  };
}

// Convert database format to local DailyGoal
function dailyGoalFromDb(dbGoal: DbDailyGoal): Omit<DailyGoal, 'id'> {
  return {
    syncId: dbGoal.sync_id,
    date: dbGoal.date,
    goal: dbGoal.goal,
    calorieGoal: dbGoal.calorie_goal ?? undefined,
    updatedAt: new Date(dbGoal.updated_at),
    deletedAt: dbGoal.deleted_at ? new Date(dbGoal.deleted_at) : undefined,
  };
}

/**
 * Push daily goals to cloud
 */
async function pushDailyGoalsToCloud(
  userId: string,
  lastPushTime: Date | null
): Promise<{ success: boolean; count: number; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, count: 0, error: 'Supabase not configured' };
  }

  try {
    const localGoals = await getAllDailyGoalsForSync();

    // Filter to goals that need pushing
    const goalsToPush = localGoals.filter(g => {
      if (!lastPushTime) return true;
      const updatedAt = g.updatedAt instanceof Date ? g.updatedAt : new Date(g.updatedAt || 0);
      return updatedAt > lastPushTime;
    });

    syncDebug('Goals Push: Pushing', goalsToPush.length, 'goals');

    if (goalsToPush.length === 0) {
      return { success: true, count: 0 };
    }

    let pushedCount = 0;

    for (const goal of goalsToPush) {
      try {
        const dbGoal = dailyGoalToDb(goal, userId);

        const { error } = await supabase
          .from('daily_goals')
          .upsert(dbGoal, { onConflict: 'user_id,sync_id' });

        if (error) {
          console.error('[Sync] Goals Push error:', goal.syncId, error);
        } else {
          pushedCount++;
        }
      } catch (err) {
        console.error('[Sync] Goals Push exception:', goal.syncId, err);
      }
    }

    return { success: true, count: pushedCount };
  } catch (err) {
    return {
      success: false,
      count: 0,
      error: err instanceof Error ? err.message : 'Goals push failed',
    };
  }
}

/**
 * Pull daily goals from cloud
 */
async function pullDailyGoalsFromCloud(
  userId: string,
  lastPullTime: Date | null
): Promise<{ success: boolean; count: number; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, count: 0, error: 'Supabase not configured' };
  }

  try {
    let query = supabase
      .from('daily_goals')
      .select('*')
      .eq('user_id', userId);

    if (lastPullTime) {
      // Use gte with buffer to avoid missing entries due to clock drift
      const bufferMs = 5000;
      const adjustedTime = new Date(lastPullTime.getTime() - bufferMs);
      query = query.gte('updated_at', adjustedTime.toISOString());
    }

    const { data: cloudGoals, error } = await query;

    if (error) {
      console.error('[Sync] Goals Pull error:', error);
      return { success: false, count: 0, error: error.message };
    }

    syncDebug('Goals Pull: Received', cloudGoals?.length || 0, 'goals');

    if (!cloudGoals || cloudGoals.length === 0) {
      return { success: true, count: 0 };
    }

    let pulledCount = 0;

    for (const cloudGoal of cloudGoals as DbDailyGoal[]) {
      const localGoal = await getDailyGoalBySyncId(cloudGoal.sync_id);
      const cloudUpdatedAt = new Date(cloudGoal.updated_at);

      let localUpdatedAt = new Date(0);
      if (localGoal?.updatedAt) {
        localUpdatedAt = localGoal.updatedAt instanceof Date
          ? localGoal.updatedAt
          : new Date(localGoal.updatedAt);
      }

      if (!localGoal || cloudUpdatedAt > localUpdatedAt) {
        const goalData = dailyGoalFromDb(cloudGoal);
        await upsertDailyGoalBySyncId({
          ...goalData,
          id: localGoal?.id,
        } as DailyGoal);
        pulledCount++;
      }
    }

    syncDebug('Goals Pull: Upserted', pulledCount, 'goals');
    return { success: true, count: pulledCount };
  } catch (err) {
    console.error('[Sync] Goals Pull exception:', err);
    return {
      success: false,
      count: 0,
      error: err instanceof Error ? err.message : 'Goals pull failed',
    };
  }
}

/**
 * Sync daily goals bidirectionally
 */
async function syncDailyGoals(
  userId: string,
  lastPushTime: Date | null,
  lastPullTime: Date | null
): Promise<{ pushed: number; pulled: number }> {
  const pushResult = await pushDailyGoalsToCloud(userId, lastPushTime);
  if (!pushResult.success) {
    console.error('[Sync] Goals push failed:', pushResult.error);
  }

  const pullResult = await pullDailyGoalsFromCloud(userId, lastPullTime);
  if (!pullResult.success) {
    console.error('[Sync] Goals pull failed:', pullResult.error);
  }

  return {
    pushed: pushResult.count,
    pulled: pullResult.count,
  };
}

/**
 * Sync settings bidirectionally
 * 1. Pull settings from cloud
 * 2. Merge: cloud wins, but keep local values for sensitive/complex fields if cloud is empty
 * 3. Push merged settings back to cloud
 */
async function syncSettingsBidirectional(userId: string): Promise<boolean> {
  try {
    // Get local settings
    const localSettings = await getUserSettings();
    syncDebug('Local settings before sync:', localSettings);

    // Pull from cloud
    const cloudSettings = await pullSettingsFromCloud(userId);
    syncDebug('Cloud settings:', cloudSettings);

    if (cloudSettings) {
      // Merge strategy:
      // - Cloud wins for most fields (cloud is authoritative)
      // - For boolean toggles: true wins (if either cloud or local has true, use true)
      //   This ensures enabling a feature on any device propagates everywhere
      // - For sensitive fields: local wins (security)
      const mergedSettings: UserSettings = {
        ...cloudSettings,
        // Keep local API key if set (security - never overwrite local key)
        claudeApiKey: localSettings?.claudeApiKey || cloudSettings.claudeApiKey,
        // Keep local dietary preferences if cloud doesn't have them
        dietaryPreferences: cloudSettings.dietaryPreferences || localSettings?.dietaryPreferences,
        // For boolean toggles: true wins (enabling on any device should propagate)
        advisorOnboarded: cloudSettings.advisorOnboarded || localSettings?.advisorOnboarded,
        advisorOnboardingStarted: cloudSettings.advisorOnboardingStarted || localSettings?.advisorOnboardingStarted,
        logWelcomeShown: cloudSettings.logWelcomeShown || localSettings?.logWelcomeShown,
        // For tracking toggles: true wins (enabling on any device should propagate)
        calorieTrackingEnabled: cloudSettings.calorieTrackingEnabled || localSettings?.calorieTrackingEnabled,
        mpsTrackingEnabled: cloudSettings.mpsTrackingEnabled || localSettings?.mpsTrackingEnabled,
      };

      // Save merged settings locally
      await saveUserSettings(mergedSettings);
      syncDebug('Settings merged and saved locally:', mergedSettings);

      // Push merged settings to cloud (ensures cloud has the combined state)
      await pushSettingsToCloud(userId, mergedSettings);
      syncDebug('Merged settings pushed to cloud');
    } else {
      syncDebug('No cloud settings found, pushing local to cloud');
      // No cloud settings, push local to establish them
      if (localSettings) {
        await pushSettingsToCloud(userId, localSettings);
      }
    }

    return true;
  } catch (err) {
    console.error('[Sync] Settings sync error:', err);
    return false;
  }
}

/**
 * Full bidirectional sync
 * 1. Push local changes to cloud
 * 2. Pull cloud changes to local
 * 3. Sync settings
 * Uses timestamps to minimize data transfer
 */
export async function fullSync(userId: string): Promise<SyncResult> {
  syncDebug('Starting full sync for user:', userId);

  if (!isSupabaseConfigured()) {
    syncDebug('Supabase not configured');
    return { success: false, pushed: 0, pulled: 0, error: 'Supabase not configured' };
  }

  try {
    // Get last sync times
    const lastPushTimeStr = await getSyncMeta('lastPushTime');
    const lastPullTimeStr = await getSyncMeta('lastPullTime');
    const lastPushTime = lastPushTimeStr ? new Date(lastPushTimeStr) : null;
    const lastPullTime = lastPullTimeStr ? new Date(lastPullTimeStr) : null;

    syncDebug('Last push time:', lastPushTime, 'Last pull time:', lastPullTime);

    const syncStartTime = new Date();

    // Push first (send local changes)
    const pushResult = await pushToCloud(userId, lastPushTime);
    syncDebug('Push result:', pushResult);
    if (!pushResult.success) {
      return { success: false, pushed: 0, pulled: 0, error: pushResult.error };
    }

    // Then pull (receive remote changes)
    const pullResult = await pullFromCloud(userId, lastPullTime);
    syncDebug('Pull result:', pullResult);
    if (!pullResult.success) {
      return { success: false, pushed: pushResult.count, pulled: 0, error: pullResult.error };
    }

    // Sync settings
    const settingsSynced = await syncSettingsBidirectional(userId);

    // Sync chat messages
    const chatResult = await syncChatMessages(userId, lastPushTime, lastPullTime);

    // Sync daily goals
    const goalsResult = await syncDailyGoals(userId, lastPushTime, lastPullTime);

    // Update sync timestamps
    await setSyncMeta('lastPushTime', syncStartTime.toISOString());
    await setSyncMeta('lastPullTime', syncStartTime.toISOString());
    await setSyncMeta('lastSyncTime', syncStartTime.toISOString());

    syncDebug('Sync complete. Food pushed:', pushResult.count, 'pulled:', pullResult.count,
      'Settings synced:', settingsSynced, 'Messages pushed:', chatResult.pushed, 'pulled:', chatResult.pulled,
      'Goals pushed:', goalsResult.pushed, 'pulled:', goalsResult.pulled);

    return {
      success: true,
      pushed: pushResult.count,
      pulled: pullResult.count,
      settingsSynced,
      messagesPushed: chatResult.pushed,
      messagesPulled: chatResult.pulled,
      goalsPushed: goalsResult.pushed,
      goalsPulled: goalsResult.pulled,
    };
  } catch (err) {
    console.error('[Sync] Sync exception:', err);
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      error: err instanceof Error ? err.message : 'Sync failed',
    };
  }
}

/**
 * Quick push - just push local changes without pulling
 * Useful for immediate persistence of new entries
 */
export async function quickPush(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const lastPushTimeStr = await getSyncMeta('lastPushTime');
  const lastPushTime = lastPushTimeStr ? new Date(lastPushTimeStr) : null;

  const result = await pushToCloud(userId, lastPushTime);

  if (result.success) {
    await setSyncMeta('lastPushTime', new Date().toISOString());
  }

  return result.success;
}

// Settings sync (unchanged but updated types)
export async function pushSettingsToCloud(userId: string, settings: UserSettings): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const dbSettings = {
      user_id: userId,
      default_goal: settings.defaultGoal,
      calorie_goal: settings.calorieGoal ?? null,
      calorie_tracking_enabled: settings.calorieTrackingEnabled ?? false,
      mps_tracking_enabled: settings.mpsTrackingEnabled ?? false,
      theme: settings.theme,
      claude_api_key: settings.claudeApiKey ?? null,
      dietary_preferences: settings.dietaryPreferences ?? null,
      advisor_onboarded: settings.advisorOnboarded ?? false,
      advisor_onboarding_started: settings.advisorOnboardingStarted ?? false,
      log_welcome_shown: settings.logWelcomeShown ?? false,
      updated_at: new Date().toISOString(),
    };

    syncDebug('Pushing settings to cloud:', dbSettings);

    const { error } = await supabase
      .from('user_settings')
      .upsert(dbSettings, {
        onConflict: 'user_id',
      });

    if (error) {
      console.error('[Sync] Error pushing settings:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Sync] Exception pushing settings:', err);
    return false;
  }
}

export async function pullSettingsFromCloud(userId: string): Promise<UserSettings | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[Sync] Error pulling settings:', error);
      return null;
    }
    if (!data) return null;

    syncDebug('Pulled settings from cloud:', data);

    return {
      defaultGoal: data.default_goal,
      calorieGoal: data.calorie_goal ?? undefined,
      calorieTrackingEnabled: data.calorie_tracking_enabled ?? false,
      mpsTrackingEnabled: data.mps_tracking_enabled ?? false,
      theme: data.theme as UserSettings['theme'],
      claudeApiKey: data.claude_api_key ?? undefined,
      dietaryPreferences: data.dietary_preferences ?? undefined,
      advisorOnboarded: data.advisor_onboarded ?? false,
      advisorOnboardingStarted: data.advisor_onboarding_started ?? false,
      logWelcomeShown: data.log_welcome_shown ?? false,
    };
  } catch (err) {
    console.error('[Sync] Exception pulling settings:', err);
    return null;
  }
}

/**
 * Clear all sync metadata (for fresh start)
 */
export async function clearSyncMeta(): Promise<void> {
  await db.syncMeta.clear();
}

/**
 * Debug function to check what's in the cloud
 */
export async function debugCloudEntries(userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    syncDebug('Debug: Supabase not configured');
    return;
  }

  const { data, error } = await supabase
    .from('food_entries')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('[Sync Debug] Error fetching cloud entries:', error);
  } else {
    syncDebug('Debug: Cloud entries for user:', userId);
    syncDebug('Debug: Total count:', data?.length);
    data?.forEach((entry, i) => {
      console.log(`[Sync Debug] Entry ${i + 1}:`, {
        id: entry.id,
        syncId: entry.sync_id,
        foodName: entry.food_name,
        date: entry.date,
        updatedAt: entry.updated_at,
        deletedAt: entry.deleted_at,
      });
    });
  }
}

/**
 * Debug function to check what's in local DB
 */
export async function debugLocalEntries(): Promise<void> {
  const entries = await getAllEntriesForSync();
  syncDebug('Debug: Local entries:');
  syncDebug('Debug: Total count:', entries.length);
  entries.forEach((entry, i) => {
    console.log(`[Sync Debug] Entry ${i + 1}:`, {
      id: entry.id,
      syncId: entry.syncId,
      foodName: entry.foodName,
      date: entry.date,
      updatedAt: entry.updatedAt,
      deletedAt: entry.deletedAt,
    });
  });
}
