import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types';
import { FoodCard } from './FoodCard';
import { QuickReplies } from './QuickReplies';
import { TypingIndicator } from './TypingIndicator';
import { MarkdownText } from './MarkdownText';

interface MessageBubbleProps {
  message: ChatMessage;
  onConfirm?: (entry: ChatMessage['foodEntry']) => void;
  onEdit?: (entry: ChatMessage['foodEntry']) => void;
  onDelete?: (entry: ChatMessage['foodEntry']) => void;
  onCancel?: (entry: ChatMessage['foodEntry']) => void;
  onQuickReply?: (reply: string) => void;
  showCalories?: boolean;
  isLatestMessage?: boolean;
}

export function MessageBubble({
  message,
  onConfirm,
  onEdit,
  onDelete,
  onCancel,
  onQuickReply,
  showCalories,
  isLatestMessage,
}: MessageBubbleProps) {
  const isUser = message.type === 'user';
  const isConfirmed = !!message.foodEntrySyncId;

  // Show quick replies only for latest message with advisor replies
  const showQuickReplies = isLatestMessage &&
    message.advisorQuickReplies &&
    message.advisorQuickReplies.length > 0;

  return (
    <div
      className={cn(
        'flex w-full mb-3',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%]',
          isUser
            ? message.imageData
              ? 'rounded-2xl rounded-br-md overflow-hidden bg-primary text-primary-foreground'
              : 'rounded-2xl rounded-br-md px-4 py-2 bg-primary text-primary-foreground'
            : 'text-foreground/80 text-sm py-1'
        )}
      >
        {message.isLoading ? (
          <TypingIndicator />
        ) : (
          <>
            {message.imageData && (
              <img
                src={message.imageData}
                alt="Food"
                loading="lazy"
                className="max-w-full block"
              />
            )}
            {message.content && (
              <div className={cn('text-sm', message.imageData && isUser && 'px-4 py-2')}>
                <MarkdownText>{message.content}</MarkdownText>
              </div>
            )}
            {message.foodEntry && (
              <div className={message.content ? 'mt-2' : ''}>
                <FoodCard
                  entry={message.foodEntry}
                  onConfirm={() => onConfirm?.(message.foodEntry)}
                  onEdit={() => onEdit?.(message.foodEntry)}
                  onDelete={() => onDelete?.(message.foodEntry)}
                  onCancel={() => onCancel?.(message.foodEntry)}
                  showCalories={showCalories}
                  isConfirmed={isConfirmed}
                />
              </div>
            )}
            {showQuickReplies && onQuickReply && (
              <QuickReplies
                replies={message.advisorQuickReplies!}
                onSelect={onQuickReply}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
