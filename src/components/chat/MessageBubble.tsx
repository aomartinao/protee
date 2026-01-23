import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types';
import { FoodCard } from './FoodCard';

interface MessageBubbleProps {
  message: ChatMessage;
  onConfirm?: (entry: ChatMessage['foodEntry']) => void;
  onEdit?: (entry: ChatMessage['foodEntry']) => void;
  showCalories?: boolean;
}

export function MessageBubble({ message, onConfirm, onEdit, showCalories }: MessageBubbleProps) {
  const isUser = message.type === 'user';
  const isSystem = message.type === 'system';

  return (
    <div
      className={cn(
        'flex w-full mb-3',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : isSystem
            ? 'bg-muted text-muted-foreground text-sm'
            : 'bg-card border rounded-bl-md'
        )}
      >
        {message.isLoading ? (
          <div className="flex items-center gap-2 py-1">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Analyzing...</span>
          </div>
        ) : (
          <>
            {message.imageData && (
              <img
                src={message.imageData}
                alt="Food"
                className="rounded-lg mb-2 max-w-full"
              />
            )}
            {message.content && (
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            )}
            {message.foodEntry && (
              <div className="mt-2">
                <FoodCard
                  entry={message.foodEntry}
                  onConfirm={() => onConfirm?.(message.foodEntry)}
                  onEdit={() => onEdit?.(message.foodEntry)}
                  showCalories={showCalories}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
