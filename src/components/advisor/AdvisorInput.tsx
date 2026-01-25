import { useState, useRef } from 'react';
import { Camera, Send, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { compressImage } from '@/lib/utils';

interface AdvisorInputProps {
  onSendText: (text: string) => void;
  onSendImage: (imageData: string) => void;
  disabled?: boolean;
}

export function AdvisorInput({ onSendText, onSendImage, disabled }: AdvisorInputProps) {
  const [text, setText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && !disabled) {
      onSendText(text.trim());
      setText('');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && !disabled) {
      try {
        const compressed = await compressImage(file);
        onSendImage(compressed);
      } catch (error) {
        console.error('Error processing image:', error);
      }
    }
    e.target.value = '';
  };

  return (
    <div className="border-t bg-card p-3 safe-area-inset-bottom">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
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
            disabled={disabled}
          >
            <Camera className="h-5 w-5 text-muted-foreground" />
            <span className="sr-only">Take photo of menu</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full hover:bg-muted"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
            <span className="sr-only">Upload menu image</span>
          </Button>
        </div>

        {/* Text input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What should I eat?"
            disabled={disabled}
            className="w-full h-10 px-4 rounded-full bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>

        {/* Send button */}
        <Button
          type="submit"
          size="icon"
          className="h-10 w-10 rounded-full"
          disabled={!text.trim() || disabled}
        >
          <Send className="h-5 w-5" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}
