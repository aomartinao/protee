import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types';
import { FoodCard } from './FoodCard';
import { QuickReplies } from './QuickReplies';
import { TypingIndicator } from './TypingIndicator';
import { TypewriterText } from './TypewriterText';
import { MarkdownText } from './MarkdownText';

interface MessageBubbleProps {
  message: ChatMessage;
  onConfirm?: (entry: ChatMessage['foodEntry']) => void;
  onEdit?: (entry: ChatMessage['foodEntry']) => void;
  onQuickReply?: (reply: string) => void;
  showCalories?: boolean;
  isLatestMessage?: boolean;
}

export function MessageBubble({
  message,
  onConfirm,
  onEdit,
  onQuickReply,
  showCalories,
  isLatestMessage,
}: MessageBubbleProps) {
  const isUser = message.type === 'user';
  const isSystem = message.type === 'system';
  const isAssistant = message.type === 'assistant';
  const isConfirmed = !!message.foodEntrySyncId;

  // Track if we should animate this message
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [typewriterComplete, setTypewriterComplete] = useState(false);
  const prevLoadingRef = useRef(message.isLoading);
  const animatedContentRef = useRef<string | null>(null);

  // Detect when loading finishes to trigger animation
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    const isNowLoaded = !message.isLoading && message.content;

    // Animate if: was loading, now has content, is latest message, and we haven't animated this content yet
    if (wasLoading && isNowLoaded && isLatestMessage && animatedContentRef.current !== message.content) {
      setShouldAnimate(true);
      setTypewriterComplete(false);
      animatedContentRef.current = message.content;
    }

    prevLoadingRef.current = message.isLoading;
  }, [message.isLoading, message.content, isLatestMessage]);

  // Only show quick replies after typewriter completes (or if not animating)
  const showQuickReplies = isLatestMessage &&
    message.advisorQuickReplies &&
    message.advisorQuickReplies.length > 0 &&
    (!shouldAnimate || typewriterComplete);

  const handleTypewriterComplete = () => {
    setTypewriterComplete(true);
  };

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
            ? 'rounded-2xl rounded-br-md px-4 py-2 bg-primary text-primary-foreground'
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
                className="rounded-lg mb-2 max-w-full"
              />
            )}
            {message.content && (
              <div className="text-sm">
                {(isAssistant || isSystem) && shouldAnimate && !typewriterComplete ? (
                  <TypewriterText
                    text={message.content}
                    speed={12}
                    onComplete={handleTypewriterComplete}
                  />
                ) : (
                  <MarkdownText>{message.content}</MarkdownText>
                )}
              </div>
            )}
            {message.foodEntry && (
              <div className="mt-2">
                <FoodCard
                  entry={message.foodEntry}
                  onConfirm={() => onConfirm?.(message.foodEntry)}
                  onEdit={() => onEdit?.(message.foodEntry)}
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
