import { cn } from '@/lib/utils';

interface QuickRepliesProps {
  replies: string[];
  onSelect: (reply: string) => void;
  disabled?: boolean;
}

export function QuickReplies({ replies, onSelect, disabled }: QuickRepliesProps) {
  if (!replies || replies.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {replies.map((reply) => (
        <button
          key={reply}
          onClick={() => onSelect(reply)}
          disabled={disabled}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm font-medium',
            'bg-primary/15 text-foreground border border-primary/30',
            'hover:bg-primary/25 active:bg-primary/35',
            'transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {reply}
        </button>
      ))}
    </div>
  );
}
