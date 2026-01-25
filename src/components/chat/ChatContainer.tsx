import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { useStore } from '@/store/useStore';
import { triggerSync, useAuthStore } from '@/store/useAuthStore';
import { getNickname } from '@/lib/nicknames';
import { analyzeFood, refineAnalysis } from '@/services/ai/client';
import { addFoodEntry } from '@/db';
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
  const navigate = useNavigate();
  const {
    messages,
    messagesLoaded,
    addMessage,
    updateMessage,
    clearMessages,
    loadMessages,
    settings,
    isAnalyzing,
    setIsAnalyzing,
    pendingMessageSyncId,
    setPendingMessageSyncId,
  } = useStore();

  const { user } = useAuthStore();
  const nickname = getNickname(user?.email);

  const [editingEntry, setEditingEntry] = useState<Partial<FoodEntry> | null>(null);
  const [editProtein, setEditProtein] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editMessageSyncId, setEditMessageSyncId] = useState<string | null>(null);
  const [editRefinement, setEditRefinement] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // Load messages from IndexedDB on mount
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Add welcome message on first load (only after messages are loaded)
  useEffect(() => {
    if (messagesLoaded && messages.length === 0) {
      const greeting = nickname ? `Hi ${nickname}! ` : "Hi! ";
      addMessage({
        syncId: crypto.randomUUID(),
        type: 'system',
        content: `${greeting}I'm here to help you track protein. Type what you ate (like "200g chicken breast") or take a photo of your food or nutrition label.`,
        timestamp: new Date(),
      });
    }
  }, [messagesLoaded, messages.length, addMessage, nickname]);

  const handleSendText = async (text: string) => {
    const userSyncId = crypto.randomUUID();
    await addMessage({
      syncId: userSyncId,
      type: 'user',
      content: text,
      timestamp: new Date(),
    });

    if (!settings.claudeApiKey) {
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

        const result = await refineAnalysis(settings.claudeApiKey, originalAnalysis, text);

        // Calculate consumedAt Date from parsed values
        let consumedAt: Date | undefined;
        if (result.consumedAt) {
          const [year, month, day] = result.consumedAt.parsedDate.split('-').map(Number);
          const [hours, minutes] = result.consumedAt.parsedTime.split(':').map(Number);
          consumedAt = new Date(year, month - 1, day, hours, minutes);
        }

        await updateMessage(pendingMessageSyncId, {
          content: result.reasoning || 'Updated analysis:',
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
      const result = await analyzeFood(settings.claudeApiKey, { text, nickname });

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
        content: result.reasoning || 'Here\'s what I found:',
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

    if (!settings.claudeApiKey) {
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
      const result = await analyzeFood(settings.claudeApiKey, { imageBase64: imageData, nickname });

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
        content: result.reasoning || 'Here\'s what I found:',
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

      // Clear messages and navigate to Today tab
      clearMessages();
      navigate('/');
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
    if (!editRefinement.trim() || !settings.claudeApiKey) return;

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

      const result = await refineAnalysis(settings.claudeApiKey, originalAnalysis, editRefinement);

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
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.syncId}
            message={message}
            onConfirm={(entry) => handleConfirm(entry, message.syncId)}
            onEdit={(entry) => handleEdit(entry, message.syncId)}
            showCalories={settings.calorieTrackingEnabled}
            isLatestMessage={index === messages.length - 1}
          />
        ))}
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
        <DialogContent>
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
            {settings.claudeApiKey && (
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
