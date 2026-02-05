import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Camera, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store/useStore';
import { compressImage, cn, triggerHaptic } from '@/lib/utils';

const LONG_PRESS_DURATION = 400; // ms to trigger long press

interface FloatingAddButtonProps {
  className?: string;
}

type SelectedOption = 'camera' | 'gallery' | null;

export function FloatingAddButton({ className }: FloatingAddButtonProps) {
  const navigate = useNavigate();
  const { setPendingImageFromHome } = useStore();

  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedOption, setSelectedOption] = useState<SelectedOption>(null);

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef(false);
  const isLongPressRef = useRef(false);
  const menuJustOpenedRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    hasMovedRef.current = false;
    isLongPressRef.current = false;
    menuJustOpenedRef.current = false;

    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      menuJustOpenedRef.current = true;
      setIsExpanded(true);
      triggerHaptic('medium');
    }, LONG_PRESS_DURATION);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 10 && !isLongPressRef.current) {
      hasMovedRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (menuJustOpenedRef.current) {
      menuJustOpenedRef.current = false;
      touchStartRef.current = null;
      hasMovedRef.current = false;
      isLongPressRef.current = false;
      return;
    }

    if (isExpanded) {
      setIsExpanded(false);
      setSelectedOption(null);
    } else if (!hasMovedRef.current && !isLongPressRef.current) {
      navigate('/coach');
    }

    touchStartRef.current = null;
    hasMovedRef.current = false;
    isLongPressRef.current = false;
  }, [isExpanded, navigate]);

  const handleMouseDown = useCallback(() => {
    hasMovedRef.current = false;
    isLongPressRef.current = false;
    menuJustOpenedRef.current = false;

    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      menuJustOpenedRef.current = true;
      setIsExpanded(true);
    }, LONG_PRESS_DURATION);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (menuJustOpenedRef.current) {
      menuJustOpenedRef.current = false;
      isLongPressRef.current = false;
      return;
    }

    if (isExpanded) {
      setIsExpanded(false);
      setSelectedOption(null);
    } else if (!isLongPressRef.current) {
      navigate('/coach');
    }

    isLongPressRef.current = false;
  }, [isExpanded, navigate]);

  const handleOptionClick = useCallback((option: 'camera' | 'gallery', e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    triggerHaptic('light');

    if (option === 'camera') {
      cameraInputRef.current?.click();
    } else {
      galleryInputRef.current?.click();
    }
    setIsExpanded(false);
    setSelectedOption(null);
  }, []);

  const handleFileChange = useCallback(async (
    e: React.ChangeEvent<HTMLInputElement>,
    source: 'camera' | 'gallery'
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setPendingImageFromHome(compressed, source);
        navigate('/coach');
      } catch (error) {
        console.error('Error processing image:', error);
      }
    }
    e.target.value = '';
  }, [navigate, setPendingImageFromHome]);

  // Close on outside tap - but NOT on option buttons
  useEffect(() => {
    if (!isExpanded) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;

      // Don't close if clicking the main button or option buttons
      if (buttonRef.current?.contains(target)) return;
      if (optionsRef.current?.contains(target)) return;

      setIsExpanded(false);
      setSelectedOption(null);
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isExpanded]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFileChange(e, 'camera')}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileChange(e, 'gallery')}
        className="hidden"
      />

      {/* Backdrop when expanded */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity duration-200"
          onClick={() => {
            setIsExpanded(false);
            setSelectedOption(null);
          }}
        />
      )}

      {/* Option buttons - to the left of the main button */}
      {isExpanded && (
        <div
          ref={optionsRef}
          className="fixed top-4 right-20 z-50 flex flex-row gap-3 items-center safe-area-inset-top"
        >
          {/* Gallery option (leftmost) */}
          <button
            type="button"
            className={cn(
              'h-12 w-12 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center',
              selectedOption === 'gallery'
                ? 'bg-primary text-primary-foreground scale-110 ring-2 ring-primary ring-offset-2'
                : 'bg-secondary text-secondary-foreground'
            )}
            onClick={(e) => handleOptionClick('gallery', e)}
            onTouchEnd={(e) => handleOptionClick('gallery', e)}
            onMouseEnter={() => setSelectedOption('gallery')}
            onMouseLeave={() => setSelectedOption(null)}
          >
            <ImageIcon className="h-5 w-5" />
          </button>

          {/* Camera option (next to plus button) */}
          <button
            type="button"
            className={cn(
              'h-12 w-12 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center',
              selectedOption === 'camera'
                ? 'bg-primary text-primary-foreground scale-110 ring-2 ring-primary ring-offset-2'
                : 'bg-secondary text-secondary-foreground'
            )}
            onClick={(e) => handleOptionClick('camera', e)}
            onTouchEnd={(e) => handleOptionClick('camera', e)}
            onMouseEnter={() => setSelectedOption('camera')}
            onMouseLeave={() => setSelectedOption(null)}
          >
            <Camera className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Main button - header level, right side like iOS */}
      <Button
        ref={buttonRef}
        size="icon"
        className={cn(
          'fixed top-4 right-4 h-12 w-12 rounded-full shadow-lg z-50 transition-transform duration-200 select-none safe-area-inset-top',
          isExpanded && 'rotate-45 bg-muted text-muted-foreground',
          className
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        <Plus className="h-6 w-6" />
      </Button>
    </>
  );
}
