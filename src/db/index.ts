import Dexie, { type EntityTable } from 'dexie';
import type { FoodEntry, UserSettings, DailyGoal, ChatMessage, SleepEntry, TrainingEntry } from '@/types';

interface SyncMeta {
  id?: number;
  key: string;
  value: string;
}

const db = new Dexie('ProteeDB') as Dexie & {
  foodEntries: EntityTable<FoodEntry, 'id'>;
  userSettings: EntityTable<UserSettings, 'id'>;
  dailyGoals: EntityTable<DailyGoal, 'id'>;
  syncMeta: EntityTable<SyncMeta, 'id'>;
  chatMessages: EntityTable<ChatMessage, 'id'>;
  sleepEntries: EntityTable<SleepEntry, 'id'>;
  trainingEntries: EntityTable<TrainingEntry, 'id'>;
};

db.version(1).stores({
  foodEntries: '++id, date, source, createdAt',
  userSettings: '++id',
  dailyGoals: '++id, date',
});

// Version 2: Added calories field to foodEntries (optional field, no index changes needed)
db.version(2).stores({
  foodEntries: '++id, date, source, createdAt',
  userSettings: '++id',
  dailyGoals: '++id, date',
});

// Version 3: Added sync fields (syncId, updatedAt, deletedAt)
// Note: syncId and updatedAt not indexed because they can be undefined in old entries
db.version(3).stores({
  foodEntries: '++id, date, source, createdAt',
  userSettings: '++id',
  dailyGoals: '++id, date',
  syncMeta: '++id, key',  // Store sync metadata like lastSyncTime
}).upgrade(tx => {
  // Migrate existing entries to have sync fields
  return tx.table('foodEntries').toCollection().modify(entry => {
    if (!entry.syncId) {
      entry.syncId = crypto.randomUUID();
    }
    if (!entry.updatedAt) {
      entry.updatedAt = entry.createdAt || new Date();
    }
    // deletedAt stays undefined (not deleted)
  });
});

// Version 4: Added chatMessages table for chat persistence and sync
db.version(4).stores({
  foodEntries: '++id, date, source, createdAt',
  userSettings: '++id',
  dailyGoals: '++id, date',
  syncMeta: '++id, key',
  chatMessages: '++id, syncId, timestamp',
});

// Version 5: Added syncStatus field for tracking per-entry sync state
db.version(5).stores({
  foodEntries: '++id, date, source, createdAt, syncStatus',
  userSettings: '++id',
  dailyGoals: '++id, date',
  syncMeta: '++id, key',
  chatMessages: '++id, syncId, timestamp',
}).upgrade(tx => {
  // Migrate existing entries - assume they are synced if they have a syncId
  return tx.table('foodEntries').toCollection().modify(entry => {
    if (!entry.syncStatus) {
      // If entry has syncId and was previously synced, mark as synced
      // Otherwise mark as pending to be safe
      entry.syncStatus = entry.syncId ? 'synced' : 'pending';
    }
  });
});

// Version 6: Added sleepEntries and trainingEntries tables for GRRROMODE
db.version(6).stores({
  foodEntries: '++id, date, source, createdAt, syncStatus',
  userSettings: '++id',
  dailyGoals: '++id, date',
  syncMeta: '++id, key',
  chatMessages: '++id, syncId, timestamp',
  sleepEntries: '++id, date',
  trainingEntries: '++id, date',
});

export { db };

/**
 * Normalize dates in a food entry - IndexedDB stores Date objects as strings,
 * so we need to convert them back when reading.
 */
function normalizeFoodEntryDates(entry: FoodEntry): FoodEntry {
  return {
    ...entry,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt),
    updatedAt: entry.updatedAt
      ? (entry.updatedAt instanceof Date ? entry.updatedAt : new Date(entry.updatedAt))
      : undefined,
    deletedAt: entry.deletedAt
      ? (entry.deletedAt instanceof Date ? entry.deletedAt : new Date(entry.deletedAt))
      : undefined,
    consumedAt: entry.consumedAt
      ? (entry.consumedAt instanceof Date ? entry.consumedAt : new Date(entry.consumedAt))
      : undefined,
  };
}

// Helper functions
export async function getEntriesForDate(date: string): Promise<FoodEntry[]> {
  const entries = await db.foodEntries.where('date').equals(date).toArray();
  // Filter out soft-deleted entries and normalize dates
  return entries.filter(e => !e.deletedAt).map(normalizeFoodEntryDates);
}

export async function getEntriesForDateRange(startDate: string, endDate: string): Promise<FoodEntry[]> {
  const entries = await db.foodEntries
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();
  // Filter out soft-deleted entries and normalize dates
  return entries.filter(e => !e.deletedAt).map(normalizeFoodEntryDates);
}

// Same as getEntriesForDateRange but includes soft-deleted entries
// Used for chat message food card lookup (to show cancelled state)
export async function getEntriesForDateRangeIncludingDeleted(startDate: string, endDate: string): Promise<FoodEntry[]> {
  const entries = await db.foodEntries
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();
  return entries.map(normalizeFoodEntryDates);
}

export async function addFoodEntry(entry: Omit<FoodEntry, 'id'>): Promise<number> {
  // Ensure sync fields are set - new entries are always pending until synced
  const entryWithSync = {
    ...entry,
    syncId: entry.syncId || crypto.randomUUID(),
    updatedAt: entry.updatedAt || new Date(),
    createdAt: entry.createdAt || new Date(),
    syncStatus: entry.syncStatus || 'pending',  // New entries start as pending
  };
  const id = await db.foodEntries.add(entryWithSync as FoodEntry);
  return id as number;
}

export async function deleteFoodEntry(id: number): Promise<void> {
  // Soft delete - mark as deleted but keep for sync
  await db.foodEntries.update(id, {
    deletedAt: new Date(),
    updatedAt: new Date()
  });
}

export async function deleteFoodEntryBySyncId(syncId: string): Promise<boolean> {
  // Soft delete by syncId - returns true if entry was found and deleted
  const entry = await getEntryBySyncId(syncId);
  if (entry?.id) {
    await db.foodEntries.update(entry.id, {
      deletedAt: new Date(),
      updatedAt: new Date()
    });
    return true;
  }
  return false;
}

export async function hardDeleteFoodEntry(id: number): Promise<void> {
  return db.foodEntries.delete(id);
}

export async function restoreFoodEntry(id: number): Promise<void> {
  // Restore a soft-deleted entry by clearing deletedAt
  await db.foodEntries.update(id, {
    deletedAt: undefined,
    updatedAt: new Date(),
    syncStatus: 'pending' as const,
  });
}

export async function updateFoodEntry(id: number, updates: Partial<FoodEntry>): Promise<number> {
  // Mark entry as pending when updated (needs to sync again)
  const updatesWithSync = {
    ...updates,
    updatedAt: new Date(),
    syncStatus: 'pending' as const,
  };
  return db.foodEntries.update(id, updatesWithSync);
}

export async function getUserSettings(): Promise<UserSettings | undefined> {
  return db.userSettings.toCollection().first();
}

export async function saveUserSettings(settings: Omit<UserSettings, 'id'>): Promise<void> {
  const existing = await getUserSettings();
  if (existing?.id) {
    await db.userSettings.update(existing.id, settings);
  } else {
    await db.userSettings.add(settings as UserSettings);
  }
}

export async function getDailyGoal(date: string): Promise<DailyGoal | undefined> {
  const goals = await db.dailyGoals.where('date').equals(date).toArray();
  // Return the first non-deleted goal
  return goals.find(g => !g.deletedAt);
}

export async function setDailyGoal(date: string, goal: number, calorieGoal?: number): Promise<void> {
  const existing = await getDailyGoal(date);
  if (existing?.id) {
    await db.dailyGoals.update(existing.id, {
      goal,
      calorieGoal,
      updatedAt: new Date(),
    });
  } else {
    await db.dailyGoals.add({
      date,
      goal,
      calorieGoal,
      syncId: crypto.randomUUID(),
      updatedAt: new Date(),
    });
  }
}

export async function getAllDailyGoals(): Promise<DailyGoal[]> {
  const goals = await db.dailyGoals.toArray();
  // Filter out soft-deleted goals
  return goals.filter(g => !g.deletedAt);
}

export async function getAllDailyGoalsForSync(): Promise<DailyGoal[]> {
  return db.dailyGoals.toArray();
}

export async function getDailyGoalBySyncId(syncId: string): Promise<DailyGoal | undefined> {
  if (!syncId) return undefined;
  const goals = await db.dailyGoals.toArray();
  return goals.find(g => g.syncId === syncId);
}

export async function upsertDailyGoalBySyncId(goal: DailyGoal): Promise<void> {
  if (!goal.syncId) {
    goal.syncId = crypto.randomUUID();
    await db.dailyGoals.add(goal);
    return;
  }
  const existing = await getDailyGoalBySyncId(goal.syncId);
  if (existing?.id) {
    await db.dailyGoals.update(existing.id, goal);
  } else {
    await db.dailyGoals.add(goal);
  }
}

// Sync metadata helpers
export async function getSyncMeta(key: string): Promise<string | null> {
  const meta = await db.syncMeta.where('key').equals(key).first();
  return meta?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  const existing = await db.syncMeta.where('key').equals(key).first();
  if (existing?.id) {
    await db.syncMeta.update(existing.id, { value });
  } else {
    await db.syncMeta.add({ key, value });
  }
}

// Get all entries (including deleted) for sync
export async function getAllEntriesForSync(): Promise<FoodEntry[]> {
  const entries = await db.foodEntries.toArray();
  return entries.map(normalizeFoodEntryDates);
}

// Get entries modified after a timestamp
export async function getEntriesModifiedAfter(timestamp: Date): Promise<FoodEntry[]> {
  // Can't use index query with potentially undefined updatedAt, filter manually
  const entries = await db.foodEntries.toArray();
  return entries
    .map(normalizeFoodEntryDates)
    .filter(e => e.updatedAt && e.updatedAt > timestamp);
}

// Get active (non-deleted) entries
export async function getActiveEntries(): Promise<FoodEntry[]> {
  const entries = await db.foodEntries.toArray();
  return entries.map(normalizeFoodEntryDates).filter(e => !e.deletedAt);
}

// Upsert entry by syncId (for sync)
export async function upsertEntryBySyncId(entry: FoodEntry): Promise<void> {
  if (!entry.syncId) {
    // No syncId, just add as new
    await db.foodEntries.add(entry);
    return;
  }
  // Find existing by syncId (manual search since not indexed)
  const existing = await getEntryBySyncId(entry.syncId);
  if (existing?.id) {
    await db.foodEntries.update(existing.id, entry);
  } else {
    await db.foodEntries.add(entry);
  }
}

// Get entry by syncId (manual filter since syncId isn't indexed)
export async function getEntryBySyncId(syncId: string): Promise<FoodEntry | undefined> {
  if (!syncId) return undefined;
  const entries = await db.foodEntries.toArray();
  const entry = entries.find(e => e.syncId === syncId);
  return entry ? normalizeFoodEntryDates(entry) : undefined;
}

// Helper to serialize dates for storage
function serializeMessage(message: Omit<ChatMessage, 'id'>): Record<string, unknown> {
  return {
    ...message,
    timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp,
    updatedAt: message.updatedAt instanceof Date ? message.updatedAt.toISOString() : message.updatedAt,
    deletedAt: message.deletedAt instanceof Date ? message.deletedAt.toISOString() : message.deletedAt,
    // Serialize foodEntry dates if present
    foodEntry: message.foodEntry ? {
      ...message.foodEntry,
      consumedAt: message.foodEntry.consumedAt instanceof Date ? message.foodEntry.consumedAt.toISOString() : message.foodEntry.consumedAt,
      createdAt: message.foodEntry.createdAt instanceof Date ? message.foodEntry.createdAt.toISOString() : message.foodEntry.createdAt,
      updatedAt: message.foodEntry.updatedAt instanceof Date ? message.foodEntry.updatedAt?.toISOString() : message.foodEntry.updatedAt,
      deletedAt: message.foodEntry.deletedAt instanceof Date ? message.foodEntry.deletedAt?.toISOString() : message.foodEntry.deletedAt,
    } : undefined,
  };
}

// Helper to deserialize dates from storage
function deserializeMessage(stored: Record<string, unknown>): ChatMessage {
  const foodEntry = stored.foodEntry as Record<string, unknown> | undefined;
  return {
    ...stored,
    timestamp: stored.timestamp ? new Date(stored.timestamp as string) : new Date(),
    updatedAt: stored.updatedAt ? new Date(stored.updatedAt as string) : undefined,
    deletedAt: stored.deletedAt ? new Date(stored.deletedAt as string) : undefined,
    foodEntry: foodEntry ? {
      ...foodEntry,
      consumedAt: foodEntry.consumedAt ? new Date(foodEntry.consumedAt as string) : undefined,
      createdAt: foodEntry.createdAt ? new Date(foodEntry.createdAt as string) : new Date(),
      updatedAt: foodEntry.updatedAt ? new Date(foodEntry.updatedAt as string) : undefined,
      deletedAt: foodEntry.deletedAt ? new Date(foodEntry.deletedAt as string) : undefined,
    } as FoodEntry : undefined,
  } as ChatMessage;
}

// Chat message helpers
export async function addChatMessage(message: Omit<ChatMessage, 'id'>): Promise<number> {
  const messageWithSync = {
    ...message,
    syncId: message.syncId || crypto.randomUUID(),
    updatedAt: message.updatedAt || new Date(),
  };
  const serialized = serializeMessage(messageWithSync);
  const id = await db.chatMessages.add(serialized as unknown as ChatMessage);
  return id as number;
}

export async function getChatMessages(limit: number = 200): Promise<ChatMessage[]> {
  // Use reverse() on id for reliable ordering (auto-increment = chronological)
  const messages = await db.chatMessages
    .reverse()
    .limit(limit)
    .toArray();
  // Filter out soft-deleted messages, deserialize dates, return in chronological order
  return messages
    .filter(m => !m.deletedAt)
    .reverse()
    .map(m => deserializeMessage(m as unknown as Record<string, unknown>));
}

export async function updateChatMessage(id: number, updates: Partial<ChatMessage>): Promise<number> {
  // Serialize any date fields in updates
  const serializedUpdates: Record<string, unknown> = { ...updates };
  if (updates.timestamp instanceof Date) {
    serializedUpdates.timestamp = updates.timestamp.toISOString();
  }
  if (updates.updatedAt instanceof Date) {
    serializedUpdates.updatedAt = updates.updatedAt.toISOString();
  } else {
    serializedUpdates.updatedAt = new Date().toISOString();
  }
  if (updates.deletedAt instanceof Date) {
    serializedUpdates.deletedAt = updates.deletedAt.toISOString();
  }
  if (updates.foodEntry) {
    serializedUpdates.foodEntry = {
      ...updates.foodEntry,
      createdAt: updates.foodEntry.createdAt instanceof Date ? updates.foodEntry.createdAt.toISOString() : updates.foodEntry.createdAt,
      updatedAt: updates.foodEntry.updatedAt instanceof Date ? updates.foodEntry.updatedAt?.toISOString() : updates.foodEntry.updatedAt,
      deletedAt: updates.foodEntry.deletedAt instanceof Date ? updates.foodEntry.deletedAt?.toISOString() : updates.foodEntry.deletedAt,
    };
  }
  return db.chatMessages.update(id, serializedUpdates as Partial<ChatMessage>);
}

export async function getChatMessageBySyncId(syncId: string): Promise<ChatMessage | undefined> {
  if (!syncId) return undefined;
  const stored = await db.chatMessages.where('syncId').equals(syncId).first();
  if (!stored) return undefined;
  return deserializeMessage(stored as unknown as Record<string, unknown>);
}

export async function upsertChatMessageBySyncId(message: ChatMessage): Promise<void> {
  const serialized = serializeMessage(message);
  if (!message.syncId) {
    await db.chatMessages.add(serialized as unknown as ChatMessage);
    return;
  }
  const existing = await db.chatMessages.where('syncId').equals(message.syncId).first();
  if (existing?.id) {
    await db.chatMessages.update(existing.id, serialized as unknown as Partial<ChatMessage>);
  } else {
    await db.chatMessages.add(serialized as unknown as ChatMessage);
  }
}

export async function getAllChatMessagesForSync(): Promise<ChatMessage[]> {
  const messages = await db.chatMessages.toArray();
  return messages.map(m => deserializeMessage(m as unknown as Record<string, unknown>));
}

export async function deleteChatMessage(id: number): Promise<void> {
  // Soft delete - serialize dates
  await db.chatMessages.update(id, {
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as Partial<ChatMessage>);
}

export async function clearAllChatMessages(): Promise<void> {
  await db.chatMessages.clear();
}

// Clean up old chat messages (hard delete, not soft delete)
// Get frequent meals for quick log shortcuts
export interface FrequentMeal {
  foodName: string;        // Display name (capitalized)
  originalName: string;    // Last logged version (for pre-fill)
  protein: number;
  calories?: number;
  count: number;
}

export async function getFrequentMeals(limit: number = 5, daysBack: number = 30): Promise<FrequentMeal[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  const entries = await db.foodEntries
    .where('date')
    .aboveOrEqual(cutoffDateStr)
    .toArray();

  // Sort by date/time descending to get most recent first
  entries.sort((a, b) => {
    const dateA = a.consumedAt || a.createdAt || new Date(a.date);
    const dateB = b.consumedAt || b.createdAt || new Date(b.date);
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  // Filter out deleted entries and count by normalized food name
  const mealCounts = new Map<string, { originalName: string; protein: number; calories?: number; count: number }>();

  for (const entry of entries) {
    if (entry.deletedAt) continue;

    // Normalize food name (lowercase, trim)
    const normalizedName = entry.foodName.toLowerCase().trim();

    const existing = mealCounts.get(normalizedName);
    if (existing) {
      existing.count++;
      // Keep the first (most recent) original name, protein, calories
    } else {
      mealCounts.set(normalizedName, {
        originalName: entry.foodName, // Keep original casing/format
        protein: entry.protein,
        calories: entry.calories,
        count: 1,
      });
    }
  }

  // Convert to array and sort by count (descending)
  const sorted = Array.from(mealCounts.entries())
    .map(([foodName, data]) => ({
      foodName: foodName.charAt(0).toUpperCase() + foodName.slice(1), // Capitalize first letter
      originalName: data.originalName,
      protein: data.protein,
      calories: data.calories,
      count: data.count,
    }))
    .filter(m => m.count >= 2) // Only show meals logged at least twice
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return sorted;
}

// Sync status tracking helpers

/**
 * Get count of entries pending sync (not yet uploaded to cloud)
 */
export async function getPendingSyncCount(): Promise<number> {
  const entries = await db.foodEntries.where('syncStatus').equals('pending').toArray();
  // Only count non-deleted entries
  return entries.filter(e => !e.deletedAt).length;
}

/**
 * Get all entries that need to be synced (pending or failed)
 */
export async function getEntriesNeedingSync(): Promise<FoodEntry[]> {
  const pending = await db.foodEntries.where('syncStatus').equals('pending').toArray();
  const failed = await db.foodEntries.where('syncStatus').equals('failed').toArray();
  return [...pending, ...failed].map(normalizeFoodEntryDates);
}

/**
 * Mark an entry as successfully synced
 */
export async function markEntrySynced(syncId: string): Promise<void> {
  const entry = await getEntryBySyncId(syncId);
  if (entry?.id) {
    await db.foodEntries.update(entry.id, { syncStatus: 'synced' });
  }
}

/**
 * Mark an entry as failed to sync
 */
export async function markEntryFailed(syncId: string): Promise<void> {
  const entry = await getEntryBySyncId(syncId);
  if (entry?.id) {
    await db.foodEntries.update(entry.id, { syncStatus: 'failed' });
  }
}

/**
 * Mark multiple entries as synced by their syncIds
 */
export async function markEntriesSynced(syncIds: string[]): Promise<void> {
  for (const syncId of syncIds) {
    await markEntrySynced(syncId);
  }
}

/**
 * Reset all failed entries to pending (for retry)
 */
export async function resetFailedEntriesToPending(): Promise<number> {
  const failed = await db.foodEntries.where('syncStatus').equals('failed').toArray();
  for (const entry of failed) {
    if (entry.id) {
      await db.foodEntries.update(entry.id, { syncStatus: 'pending' });
    }
  }
  return failed.length;
}

export async function cleanupOldChatMessages(olderThanDays: number = 21): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  const cutoffISO = cutoffDate.toISOString();

  // Get all messages and filter old ones
  const allMessages = await db.chatMessages.toArray();
  const oldMessageIds: number[] = [];

  for (const msg of allMessages) {
    const timestamp = msg.timestamp;
    // Handle both Date objects and ISO strings
    const msgDate = typeof timestamp === 'string' ? timestamp :
      timestamp instanceof Date ? timestamp.toISOString() : null;

    if (msgDate && msgDate < cutoffISO && msg.id) {
      oldMessageIds.push(msg.id);
    }
  }

  // Hard delete old messages
  if (oldMessageIds.length > 0) {
    await db.chatMessages.bulkDelete(oldMessageIds);
    console.log(`[DB] Cleaned up ${oldMessageIds.length} old chat messages`);
  }

  return oldMessageIds.length;
}

// ============================================================
// Sleep entry helpers
// ============================================================

function normalizeSleepEntryDates(entry: SleepEntry): SleepEntry {
  return {
    ...entry,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt),
    updatedAt: entry.updatedAt
      ? (entry.updatedAt instanceof Date ? entry.updatedAt : new Date(entry.updatedAt))
      : undefined,
    deletedAt: entry.deletedAt
      ? (entry.deletedAt instanceof Date ? entry.deletedAt : new Date(entry.deletedAt))
      : undefined,
  };
}

export async function getSleepEntriesForDate(date: string): Promise<SleepEntry[]> {
  const entries = await db.sleepEntries.where('date').equals(date).toArray();
  return entries.filter(e => !e.deletedAt).map(normalizeSleepEntryDates);
}

export async function addSleepEntry(entry: Omit<SleepEntry, 'id'>): Promise<number> {
  const entryWithSync = {
    ...entry,
    syncId: entry.syncId || crypto.randomUUID(),
    updatedAt: entry.updatedAt || new Date(),
    createdAt: entry.createdAt || new Date(),
    syncStatus: entry.syncStatus || 'pending',
  };
  const id = await db.sleepEntries.add(entryWithSync as SleepEntry);
  return id as number;
}

export async function getLastSleepEntry(): Promise<SleepEntry | undefined> {
  const entries = await db.sleepEntries.orderBy('date').reverse().toArray();
  const active = entries.find(e => !e.deletedAt);
  return active ? normalizeSleepEntryDates(active) : undefined;
}

export async function getSleepAverageForDays(days: number): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  const entries = await db.sleepEntries
    .where('date')
    .aboveOrEqual(cutoffDateStr)
    .toArray();

  const active = entries.filter(e => !e.deletedAt);
  if (active.length === 0) return 0;

  const totalMinutes = active.reduce((sum, e) => sum + e.duration, 0);
  return Math.round(totalMinutes / active.length);
}

export async function deleteSleepEntry(id: number): Promise<void> {
  await db.sleepEntries.update(id, {
    deletedAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function updateSleepEntry(id: number, updates: Partial<SleepEntry>): Promise<number> {
  const updatesWithSync = {
    ...updates,
    updatedAt: new Date(),
    syncStatus: 'pending' as const,
  };
  return db.sleepEntries.update(id, updatesWithSync);
}

export async function getAllSleepEntriesForSync(): Promise<SleepEntry[]> {
  const entries = await db.sleepEntries.toArray();
  return entries.map(normalizeSleepEntryDates);
}

export async function getSleepEntryBySyncId(syncId: string): Promise<SleepEntry | undefined> {
  if (!syncId) return undefined;
  const entries = await db.sleepEntries.toArray();
  const entry = entries.find(e => e.syncId === syncId);
  return entry ? normalizeSleepEntryDates(entry) : undefined;
}

export async function upsertSleepEntryBySyncId(entry: SleepEntry): Promise<void> {
  if (!entry.syncId) {
    await db.sleepEntries.add(entry);
    return;
  }
  const existing = await getSleepEntryBySyncId(entry.syncId);
  if (existing?.id) {
    await db.sleepEntries.update(existing.id, entry);
  } else {
    await db.sleepEntries.add(entry);
  }
}

// ============================================================
// Training entry helpers
// ============================================================

function normalizeTrainingEntryDates(entry: TrainingEntry): TrainingEntry {
  return {
    ...entry,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt),
    updatedAt: entry.updatedAt
      ? (entry.updatedAt instanceof Date ? entry.updatedAt : new Date(entry.updatedAt))
      : undefined,
    deletedAt: entry.deletedAt
      ? (entry.deletedAt instanceof Date ? entry.deletedAt : new Date(entry.deletedAt))
      : undefined,
  };
}

export async function getTrainingEntriesForDate(date: string): Promise<TrainingEntry[]> {
  const entries = await db.trainingEntries.where('date').equals(date).toArray();
  return entries.filter(e => !e.deletedAt).map(normalizeTrainingEntryDates);
}

export async function addTrainingEntry(entry: Omit<TrainingEntry, 'id'>): Promise<number> {
  const entryWithSync = {
    ...entry,
    syncId: entry.syncId || crypto.randomUUID(),
    updatedAt: entry.updatedAt || new Date(),
    createdAt: entry.createdAt || new Date(),
    syncStatus: entry.syncStatus || 'pending',
  };
  const id = await db.trainingEntries.add(entryWithSync as TrainingEntry);
  return id as number;
}

export async function getTrainingSessions7Days(): Promise<TrainingEntry[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  const entries = await db.trainingEntries
    .where('date')
    .aboveOrEqual(cutoffDateStr)
    .toArray();

  return entries.filter(e => !e.deletedAt && e.muscleGroup !== 'rest').map(normalizeTrainingEntryDates);
}

export async function getDaysSinceLastTraining(): Promise<number | null> {
  const entries = await db.trainingEntries.orderBy('date').reverse().toArray();
  const lastActive = entries.find(e => !e.deletedAt && e.muscleGroup !== 'rest');
  if (!lastActive) return null;

  const lastDate = new Date(lastActive.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - lastDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export async function deleteTrainingEntry(id: number): Promise<void> {
  await db.trainingEntries.update(id, {
    deletedAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function updateTrainingEntry(id: number, updates: Partial<TrainingEntry>): Promise<number> {
  const updatesWithSync = {
    ...updates,
    updatedAt: new Date(),
    syncStatus: 'pending' as const,
  };
  return db.trainingEntries.update(id, updatesWithSync);
}

export async function getAllTrainingEntriesForSync(): Promise<TrainingEntry[]> {
  const entries = await db.trainingEntries.toArray();
  return entries.map(normalizeTrainingEntryDates);
}

export async function getTrainingEntryBySyncId(syncId: string): Promise<TrainingEntry | undefined> {
  if (!syncId) return undefined;
  const entries = await db.trainingEntries.toArray();
  const entry = entries.find(e => e.syncId === syncId);
  return entry ? normalizeTrainingEntryDates(entry) : undefined;
}

export async function upsertTrainingEntryBySyncId(entry: TrainingEntry): Promise<void> {
  if (!entry.syncId) {
    await db.trainingEntries.add(entry);
    return;
  }
  const existing = await getTrainingEntryBySyncId(entry.syncId);
  if (existing?.id) {
    await db.trainingEntries.update(existing.id, entry);
  } else {
    await db.trainingEntries.add(entry);
  }
}
