import { useEffect, useRef, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { useStore } from '@/store/useStore';
import { useSettings } from '@/hooks/useProteinData';
import { triggerSync } from '@/store/useAuthStore';
import { analyzeFood, refineAnalysis } from '@/services/ai/client';
import { addFoodEntry, deleteFoodEntry, getEntryBySyncId } from '@/db';
import { getToday } from '@/lib/utils';
import type { ChatMessage, FoodEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Send, Sparkles } from 'lucide-react';

export function ChatContainer() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    messagesLoaded,
    addMessage,
    updateMessage,
    loadMessages,
    isAnalyzing,
    setIsAnalyzing,
    pendingMessageSyncId,
    setPendingMessageSyncId,
    reloadMessages,
  } = useStore();

  const { settings, updateSettings } = useSettings();

  const [editingEntry, setEditingEntry] = useState<Partial<FoodEntry> | null>(null);
  const [editProtein, setEditProtein] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editMessageSyncId, setEditMessageSyncId] = useState<string | null>(null);
  const [editRefinement, setEditRefinement] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // State for food entries looked up by syncId (for messages pulled from cloud without foodEntry)
  const [foodEntriesMap, setFoodEntriesMap] = useState<Map<string, FoodEntry>>(new Map());

  // Load messages from IndexedDB on mount
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Enrich messages with food entries when foodEntrySyncId exists but foodEntry is missing
  // This happens when messages are synced from cloud (cloud only stores foodEntrySyncId, not foodEntry)
  useEffect(() => {
    const loadMissingFoodEntries = async () => {
      const missingEntries: string[] = [];

      for (const message of messages) {
        // Message has a confirmed food entry link but no inline foodEntry data
        if (message.foodEntrySyncId && !message.foodEntry && !foodEntriesMap.has(message.foodEntrySyncId)) {
          missingEntries.push(message.foodEntrySyncId);
        }
      }

      if (missingEntries.length === 0) return;

      // Look up all missing entries
      const newEntries = new Map(foodEntriesMap);
      for (const syncId of missingEntries) {
        const entry = await getEntryBySyncId(syncId);
        if (entry) {
          newEntries.set(syncId, entry);
        }
      }

      if (newEntries.size !== foodEntriesMap.size) {
        setFoodEntriesMap(newEntries);
      }
    };

    loadMissingFoodEntries();
  }, [messages, foodEntriesMap]);

  // Create enriched messages that include looked-up food entries
  const enrichedMessages = useMemo(() => {
    return messages.map((message) => {
      // If message already has foodEntry, use it
      if (message.foodEntry) return message;

      // If message has foodEntrySyncId, look it up in our map
      if (message.foodEntrySyncId) {
        const entry = foodEntriesMap.get(message.foodEntrySyncId);
        if (entry) {
          return { ...message, foodEntry: entry };
        }
      }

      return message;
    });
  }, [messages, foodEntriesMap]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Add welcome message only on first ever visit (not on subsequent opens)
  useEffect(() => {
    if (messagesLoaded && !settings.logWelcomeShown) {
      addMessage({
        syncId: crypto.randomUUID(),
        type: 'system',
        content: `Hi! I'm here to help you track protein. Type what you ate (like "200g chicken breast") or take a photo of your food or nutrition label.`,
        timestamp: new Date(),
      });
      updateSettings({ logWelcomeShown: true });
    }
  }, [messagesLoaded, settings.logWelcomeShown, addMessage, updateSettings]);

  const handleSendText = async (text: string) => {
    const userSyncId = crypto.randomUUID();
    await addMessage({
      syncId: userSyncId,
      type: 'user',
      content: text,
      timestamp: new Date(),
    });

    const hasApiAccess = settings.claudeApiKey || settings.hasAdminApiKey;
    const useProxy = !settings.claudeApiKey && settings.hasAdminApiKey;

    if (!hasApiAccess) {
      await addMessage({
        syncId: crypto.randomUUID(),
        type: 'system',
        content:
          'Please add your Claude API key in Settings to enable AI-powered food analysis.',
        timestamp: new Date(),
      });
      return;
    }

    // Check if this is a follow-up message (refinement of pending entry)
    const pendingMessage = pendingMessageSyncId
      ? messages.find((m) => m.syncId === pendingMessageSyncId)
      : null;

    if (pendingMessageSyncId && pendingMessage?.foodEntry) {
      // This is a refinement - update the existing analysis
      setIsAnalyzing(true);
      try {
        const originalAnalysis = {
          foodName: pendingMessage.foodEntry.foodName || '',
          protein: pendingMessage.foodEntry.protein || 0,
          calories: pendingMessage.foodEntry.calories || 0,
          confidence: pendingMessage.foodEntry.confidence || 'low' as const,
          consumedAt: pendingMessage.foodEntry.consumedAt
            ? {
                parsedDate: format(pendingMessage.foodEntry.consumedAt, 'yyyy-MM-dd'),
                parsedTime: format(pendingMessage.foodEntry.consumedAt, 'HH:mm'),
              }
            : undefined,
        };

        const result = await refineAnalysis(settings.claudeApiKey || null, originalAnalysis, text, useProxy);

        // Calculate consumedAt Date from parsed values
        let consumedAt: Date | undefined;
        if (result.consumedAt) {
          const [year, month, day] = result.consumedAt.parsedDate.split('-').map(Number);
          const [hours, minutes] = result.consumedAt.parsedTime.split(':').map(Number);
          consumedAt = new Date(year, month - 1, day, hours, minutes);
        }

        await updateMessage(pendingMessageSyncId, {
          content: result.reasoning || '',
          foodEntry: {
            ...pendingMessage.foodEntry,
            date: result.consumedAt?.parsedDate || pendingMessage.foodEntry.date,
            foodName: result.foodName,
            protein: result.protein,
            calories: result.calories,
            confidence: result.confidence,
            consumedAt,
          },
        });
      } catch (error) {
        await addMessage({
          syncId: crypto.randomUUID(),
          type: 'system',
          content: `Sorry, I couldn't update the analysis. ${error instanceof Error ? error.message : 'Please try again.'}`,
          timestamp: new Date(),
        });
      } finally {
        setIsAnalyzing(false);
      }
      return;
    }

    // New entry analysis
    const loadingSyncId = crypto.randomUUID();
    await addMessage({
      syncId: loadingSyncId,
      type: 'assistant',
      content: '',
      isLoading: true,
      timestamp: new Date(),
    });

    setIsAnalyzing(true);

    try {
      const result = await analyzeFood(settings.claudeApiKey || null, { text }, useProxy);

      // Calculate consumedAt Date from parsed values
      let consumedAt: Date | undefined;
      let entryDate = getToday();
      if (result.consumedAt) {
        const [year, month, day] = result.consumedAt.parsedDate.split('-').map(Number);
        const [hours, minutes] = result.consumedAt.parsedTime.split(':').map(Number);
        consumedAt = new Date(year, month - 1, day, hours, minutes);
        entryDate = result.consumedAt.parsedDate;
      }

      await updateMessage(loadingSyncId, {
        isLoading: false,
        content: result.reasoning || '',
        foodEntry: {
          date: entryDate,
          source: 'text',
          foodName: result.foodName,
          protein: result.protein,
          calories: result.calories,
          confidence: result.confidence,
          consumedAt,
          createdAt: new Date(),
        },
      });

      // Set this as the pending message for potential follow-ups
      setPendingMessageSyncId(loadingSyncId);
    } catch (error) {
      await updateMessage(loadingSyncId, {
        isLoading: false,
        content: `Sorry, I couldn't analyze that. ${error instanceof Error ? error.message : 'Please try again.'}`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendImage = async (imageData: string) => {
    const userSyncId = crypto.randomUUID();
    await addMessage({
      syncId: userSyncId,
      type: 'user',
      content: '',
      imageData,
      timestamp: new Date(),
    });

    const hasApiAccess = settings.claudeApiKey || settings.hasAdminApiKey;
    const useProxy = !settings.claudeApiKey && settings.hasAdminApiKey;

    if (!hasApiAccess) {
      await addMessage({
        syncId: crypto.randomUUID(),
        type: 'system',
        content:
          'Please add your Claude API key in Settings to enable AI-powered food analysis.',
        timestamp: new Date(),
      });
      return;
    }

    const loadingSyncId = crypto.randomUUID();
    await addMessage({
      syncId: loadingSyncId,
      type: 'assistant',
      content: '',
      isLoading: true,
      timestamp: new Date(),
    });

    setIsAnalyzing(true);

    try {
      const result = await analyzeFood(settings.claudeApiKey || null, { imageBase64: imageData }, useProxy);

      // Calculate consumedAt Date from parsed values
      let consumedAt: Date | undefined;
      let entryDate = getToday();
      if (result.consumedAt) {
        const [year, month, day] = result.consumedAt.parsedDate.split('-').map(Number);
        const [hours, minutes] = result.consumedAt.parsedTime.split(':').map(Number);
        consumedAt = new Date(year, month - 1, day, hours, minutes);
        entryDate = result.consumedAt.parsedDate;
      }

      await updateMessage(loadingSyncId, {
        isLoading: false,
        content: result.reasoning || '',
        foodEntry: {
          date: entryDate,
          source: 'photo',
          foodName: result.foodName,
          protein: result.protein,
          calories: result.calories,
          confidence: result.confidence,
          imageData,
          consumedAt,
          createdAt: new Date(),
        },
      });

      // Set this as the pending message for potential follow-ups
      setPendingMessageSyncId(loadingSyncId);
    } catch (error) {
      await updateMessage(loadingSyncId, {
        isLoading: false,
        content: `Sorry, I couldn't analyze that image. ${error instanceof Error ? error.message : 'Please try again.'}`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirm = async (entry: ChatMessage['foodEntry'], messageSyncId?: string) => {
    if (!entry) return;

    try {
      const foodEntrySyncId = crypto.randomUUID();

      await addFoodEntry({
        syncId: foodEntrySyncId,
        date: entry.date || getToday(),
        source: entry.source || 'manual',
        foodName: entry.foodName || 'Unknown',
        protein: entry.protein || 0,
        calories: entry.calories,
        confidence: entry.confidence || 'medium',
        imageData: entry.imageData,
        consumedAt: entry.consumedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Link the message to the food entry
      if (messageSyncId) {
        await updateMessage(messageSyncId, {
          foodEntrySyncId,
        });
      }

      // Trigger cloud sync
      triggerSync();

      // Clear pending message tracking
      setPendingMessageSyncId(null);
    } catch (error) {
      await addMessage({
        syncId: crypto.randomUUID(),
        type: 'system',
        content: 'Failed to save entry. Please try again.',
        timestamp: new Date(),
      });
    }
  };

  const handleEdit = (entry: ChatMessage['foodEntry'], messageSyncId?: string) => {
    if (!entry) return;
    setEditingEntry(entry);
    setEditProtein(entry.protein?.toString() || '0');
    setEditCalories(entry.calories?.toString() || '');
    setEditName(entry.foodName || '');

    // Initialize date/time from entry or current time
    const now = new Date();
    const entryTime = entry.consumedAt ? new Date(entry.consumedAt) : now;
    setEditDate(format(entryTime, 'yyyy-MM-dd'));
    setEditTime(format(entryTime, 'HH:mm'));

    setEditMessageSyncId(messageSyncId || null);
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;

    // Construct consumedAt from date/time inputs
    let consumedAt: Date | undefined;
    let entryDate = editingEntry.date || getToday();
    if (editDate && editTime) {
      const [year, month, day] = editDate.split('-').map(Number);
      const [hours, minutes] = editTime.split(':').map(Number);
      consumedAt = new Date(year, month - 1, day, hours, minutes);
      entryDate = editDate;
    }

    const updatedEntry = {
      ...editingEntry,
      date: entryDate,
      protein: parseInt(editProtein, 10) || 0,
      calories: editCalories ? parseInt(editCalories, 10) : editingEntry.calories,
      foodName: editName || editingEntry.foodName,
      consumedAt,
    };

    // Update the message if we have the syncId (but don't auto-confirm)
    if (editMessageSyncId) {
      await updateMessage(editMessageSyncId, {
        foodEntry: updatedEntry as FoodEntry,
      });
    }

    setEditingEntry(null);
    setEditMessageSyncId(null);
    setEditRefinement('');
  };

  const handleRefineEdit = async () => {
    const hasApiAccess = settings.claudeApiKey || settings.hasAdminApiKey;
    const useProxy = !settings.claudeApiKey && settings.hasAdminApiKey;

    if (!editRefinement.trim() || !hasApiAccess) return;

    setIsRefining(true);
    try {
      const originalAnalysis = {
        foodName: editName,
        protein: parseInt(editProtein, 10) || 0,
        calories: editCalories ? parseInt(editCalories, 10) : 0,
        confidence: editingEntry?.confidence || ('medium' as const),
        consumedAt: editDate && editTime
          ? { parsedDate: editDate, parsedTime: editTime }
          : undefined,
      };

      const result = await refineAnalysis(settings.claudeApiKey || null, originalAnalysis, editRefinement, useProxy);

      // Update form fields with refined values
      setEditName(result.foodName);
      setEditProtein(result.protein.toString());
      if (result.calories !== undefined) {
        setEditCalories(result.calories.toString());
      }
      if (result.consumedAt) {
        setEditDate(result.consumedAt.parsedDate);
        setEditTime(result.consumedAt.parsedTime);
      }

      setEditRefinement('');
    } catch (error) {
      console.error('Refinement failed:', error);
    } finally {
      setIsRefining(false);
    }
  };

  const handleDelete = async (entry: ChatMessage['foodEntry'], messageSyncId?: string) => {
    if (!entry) return;

    // Find the message to get the foodEntrySyncId
    const message = messages.find((m) => m.syncId === messageSyncId);
    if (!message?.foodEntrySyncId) return;

    try {
      // Find the food entry by syncId and delete it
      const foodEntry = await getEntryBySyncId(message.foodEntrySyncId);
      if (foodEntry?.id) {
        await deleteFoodEntry(foodEntry.id);
      }

      // Remove the foodEntrySyncId from the message (unlink it)
      await updateMessage(messageSyncId!, {
        foodEntrySyncId: undefined,
      });

      // Trigger sync and reload messages
      triggerSync();
      await reloadMessages();
    } catch (error) {
      console.error('Failed to delete entry:', error);
    }
  };

  const handleCancel = async (entry: ChatMessage['foodEntry'], messageSyncId?: string) => {
    if (!entry || !messageSyncId) return;

    // Remove the foodEntry from the message (dismiss without saving)
    await updateMessage(messageSyncId, {
      foodEntry: undefined,
      content: 'Cancelled.',
    });

    // Clear pending message tracking if this was the pending one
    if (pendingMessageSyncId === messageSyncId) {
      setPendingMessageSyncId(null);
    }
  };

  // Helper to get date string from message
  const getMessageDate = (message: ChatMessage): string => {
    const time = message.foodEntry?.consumedAt || message.timestamp;
    return format(time, 'yyyy-MM-dd');
  };

  // Show loading state while messages are being loaded
  if (!messagesLoaded) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Loading messages...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 scroll-smooth overscroll-contain">
        {enrichedMessages.map((message, index) => {
          // Check if we need a date separator
          const currentDate = getMessageDate(message);
          const prevMessage = index > 0 ? enrichedMessages[index - 1] : null;
          const prevDate = prevMessage ? getMessageDate(prevMessage) : null;
          const showDateSeparator = prevDate && currentDate !== prevDate;

          return (
            <div key={message.syncId}>
              {showDateSeparator && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground font-medium">
                    {format(new Date(currentDate), 'EEEE, MMM d')}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <MessageBubble
                message={message}
                onConfirm={(entry) => handleConfirm(entry, message.syncId)}
                onEdit={(entry) => handleEdit(entry, message.syncId)}
                onDelete={(entry) => handleDelete(entry, message.syncId)}
                onCancel={(entry) => handleCancel(entry, message.syncId)}
                showCalories={settings.calorieTrackingEnabled}
                isLatestMessage={index === enrichedMessages.length - 1}
              />
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        onSendText={handleSendText}
        onSendImage={handleSendImage}
        disabled={isAnalyzing}
      />

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={() => {
        setEditingEntry(null);
        setEditRefinement('');
      }}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Food Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Protein (grams)</label>
              <Input
                type="number"
                value={editProtein}
                onChange={(e) => setEditProtein(e.target.value)}
                min={0}
                max={500}
              />
            </div>
            {settings.calorieTrackingEnabled && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Calories (kcal)</label>
                <Input
                  type="number"
                  value={editCalories}
                  onChange={(e) => setEditCalories(e.target.value)}
                  min={0}
                  max={10000}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Time</label>
                <Input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                />
              </div>
            </div>

            {/* AI Refinement Section */}
            {(settings.claudeApiKey || settings.hasAdminApiKey) && (
              <div className="pt-4 border-t space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  Or describe what changed
                </label>
                <div className="flex gap-2">
                  <Input
                    value={editRefinement}
                    onChange={(e) => setEditRefinement(e.target.value)}
                    placeholder="e.g., it was beef not pork, add a beer..."
                    disabled={isRefining}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleRefineEdit();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    onClick={handleRefineEdit}
                    disabled={!editRefinement.trim() || isRefining}
                  >
                    {isRefining ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
