import { useEffect, useRef, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { useStore } from '@/store/useStore';
import { triggerSync } from '@/store/useAuthStore';
import { analyzeFood } from '@/services/ai/client';
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
import { Loader2 } from 'lucide-react';

export function ChatContainer() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    messagesLoaded,
    addMessage,
    updateMessage,
    loadMessages,
    settings,
    isAnalyzing,
    setIsAnalyzing,
  } = useStore();

  const [editingEntry, setEditingEntry] = useState<Partial<FoodEntry> | null>(null);
  const [editProtein, setEditProtein] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editName, setEditName] = useState('');
  const [editMessageSyncId, setEditMessageSyncId] = useState<string | null>(null);

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
      addMessage({
        syncId: crypto.randomUUID(),
        type: 'system',
        content:
          "Hi! I'm here to help you track protein. Type what you ate (like \"200g chicken breast\") or take a photo of your food or nutrition label.",
        timestamp: new Date(),
      });
    }
  }, [messagesLoaded, messages.length, addMessage]);

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
      const result = await analyzeFood(settings.claudeApiKey, { text });

      await updateMessage(loadingSyncId, {
        isLoading: false,
        content: result.reasoning || 'Here\'s what I found:',
        foodEntry: {
          date: getToday(),
          source: 'text',
          foodName: result.foodName,
          protein: result.protein,
          calories: result.calories,
          confidence: result.confidence,
          createdAt: new Date(),
        },
      });
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
      const result = await analyzeFood(settings.claudeApiKey, { imageBase64: imageData });

      await updateMessage(loadingSyncId, {
        isLoading: false,
        content: result.reasoning || 'Here\'s what I found:',
        foodEntry: {
          date: getToday(),
          source: 'photo',
          foodName: result.foodName,
          protein: result.protein,
          calories: result.calories,
          confidence: result.confidence,
          imageData,
          createdAt: new Date(),
        },
      });
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

      const calorieInfo = settings.calorieTrackingEnabled && entry.calories ? ` and ${entry.calories} kcal` : '';
      await addMessage({
        syncId: crypto.randomUUID(),
        type: 'system',
        content: `Added ${entry.protein}g protein${calorieInfo} from ${entry.foodName}`,
        timestamp: new Date(),
      });
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
    setEditMessageSyncId(messageSyncId || null);
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;

    const updatedEntry = {
      ...editingEntry,
      protein: parseInt(editProtein, 10) || 0,
      calories: editCalories ? parseInt(editCalories, 10) : editingEntry.calories,
      foodName: editName || editingEntry.foodName,
    };

    // Update the message if we have the syncId
    if (editMessageSyncId) {
      await updateMessage(editMessageSyncId, {
        foodEntry: updatedEntry as FoodEntry,
      });
    }

    // Confirm the edited entry
    await handleConfirm(updatedEntry as FoodEntry, editMessageSyncId || undefined);

    setEditingEntry(null);
    setEditMessageSyncId(null);
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
        {messages.map((message) => (
          <MessageBubble
            key={message.syncId}
            message={message}
            onConfirm={(entry) => handleConfirm(entry, message.syncId)}
            onEdit={(entry) => handleEdit(entry, message.syncId)}
            showCalories={settings.calorieTrackingEnabled}
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
      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save & Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
