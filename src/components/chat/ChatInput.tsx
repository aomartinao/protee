import { useState, useRef, useEffect } from 'react';
import { Camera, Send, Image as ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { compressImage } from '@/lib/utils';

interface ChatInputProps {
  onSend: (text: string, images: string[]) => void;
  disabled?: boolean;
  onFocusChange?: (focused: boolean, hasText: boolean) => void;
  externalImage?: string | null;
  onExternalImageConsumed?: () => void;
  initialText?: string;
  onInitialTextConsumed?: () => void;
}

const MAX_IMAGES = 4;

export function ChatInput({
  onSend,
  disabled,
  onFocusChange,
  externalImage,
  onExternalImageConsumed,
  initialText,
  onInitialTextConsumed,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Handle external image (e.g., from floating add button camera)
  useEffect(() => {
    if (externalImage && pendingImages.length < MAX_IMAGES) {
      setPendingImages(prev => [...prev, externalImage]);
      onExternalImageConsumed?.();
    }
  }, [externalImage, onExternalImageConsumed, pendingImages.length]);

  // Handle initial text (e.g., from quick log pre-fill)
  useEffect(() => {
    if (initialText) {
      setText(initialText);
      onInitialTextConsumed?.();
      // Focus the input after setting text
      setTimeout(() => textInputRef.current?.focus(), 100);
    }
  }, [initialText, onInitialTextConsumed]);

  const handleFocus = () => {
    setIsFocused(true);
    onFocusChange?.(true, text.trim().length > 0);
  };

  const handleBlur = () => {
    setIsFocused(false);
    onFocusChange?.(false, text.trim().length > 0);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    setText(newText);
    if (isFocused) {
      onFocusChange?.(true, newText.trim().length > 0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((text.trim() || pendingImages.length > 0) && !disabled) {
      onSend(text.trim(), pendingImages);
      setText('');
      setPendingImages([]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && !disabled && pendingImages.length < MAX_IMAGES) {
      try {
        const compressed = await compressImage(file);
        setPendingImages(prev => [...prev, compressed]);
      } catch (error) {
        console.error('Error processing image:', error);
      }
    }
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  };

  const canAddMore = pendingImages.length < MAX_IMAGES;
  const canSend = (text.trim() || pendingImages.length > 0) && !disabled;

  return (
    <div className="border-t bg-card p-3 safe-area-inset-bottom overflow-hidden">
      {/* Pending images thumbnails */}
      {pendingImages.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {pendingImages.map((img, index) => (
            <div key={index} className="relative flex-shrink-0">
              <img
                src={img}
                alt={`Pending ${index + 1}`}
                className="w-16 h-16 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-sm"
                disabled={disabled}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 min-w-0">
        {/* Hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Action buttons */}
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full hover:bg-muted"
            onClick={() => cameraInputRef.current?.click()}
            disabled={disabled || !canAddMore}
          >
            <Camera className="h-5 w-5 text-muted-foreground" />
            <span className="sr-only">Take photo</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full hover:bg-muted"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || !canAddMore}
          >
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
            <span className="sr-only">Upload image</span>
          </Button>
        </div>

        {/* Text input */}
        <div className="flex-1 relative min-w-0">
          <input
            ref={textInputRef}
            type="text"
            value={text}
            onChange={handleTextChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={pendingImages.length > 0 ? "Add details (optional)..." : "Describe your meal..."}
            disabled={disabled}
            className="w-full h-10 px-4 rounded-full bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>

        {/* Send button */}
        <Button
          type="submit"
          size="icon"
          className="h-10 w-10 rounded-full"
          disabled={!canSend}
        >
          <Send className="h-5 w-5" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}
