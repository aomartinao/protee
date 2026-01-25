import { useMemo } from 'react';

interface MarkdownTextProps {
  children: string;
  className?: string;
}

// Simple markdown parser for basic formatting
export function MarkdownText({ children, className }: MarkdownTextProps) {
  const rendered = useMemo(() => {
    return parseMarkdown(children);
  }, [children]);

  return (
    <span className={className} dangerouslySetInnerHTML={{ __html: rendered }} />
  );
}

function parseMarkdown(text: string): string {
  // Escape HTML first to prevent XSS
  let result = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_ (but not inside words)
  result = result.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '<em>$1</em>');
  result = result.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<em>$1</em>');

  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-muted rounded text-xs">$1</code>');

  // Convert bullet points (• or - at start of line)
  result = result.replace(/^[•\-]\s+(.+)$/gm, '<span class="flex gap-2"><span class="text-primary">•</span><span>$1</span></span>');

  // Convert newlines to <br> for display (but preserve structure)
  result = result.replace(/\n/g, '<br/>');

  return result;
}
