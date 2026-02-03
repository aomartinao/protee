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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef(false);
  const isLongPressRef = useRef(false);
  // Track if the menu was just opened by this touch - don't close on the same touch end
  const menuJustOpenedRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    hasMovedRef.current = false;
    isLongPressRef.current = false;
    menuJustOpenedRef.current = false;

    // Start long press timer
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

    // If moved significantly before long press triggered, cancel long press
    if (distance > 10 && !isLongPressRef.current) {
      hasMovedRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // If menu was just opened by this long press, keep it open
    if (menuJustOpenedRef.current) {
      menuJustOpenedRef.current = false;
      touchStartRef.current = null;
      hasMovedRef.current = false;
      isLongPressRef.current = false;
      return;
    }

    if (isExpanded) {
      // Menu was already open, close it (user tapped main button to close)
      setIsExpanded(false);
      setSelectedOption(null);
    } else if (!hasMovedRef.current && !isLongPressRef.current) {
      // Simple tap - navigate to coach
      navigate('/coach');
    }

    touchStartRef.current = null;
    hasMovedRef.current = false;
    isLongPressRef.current = false;
  }, [isExpanded, navigate]);

  // Handle mouse events for desktop
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

    // If menu was just opened by this long press, keep it open
    if (menuJustOpenedRef.current) {
      menuJustOpenedRef.current = false;
      isLongPressRef.current = false;
      return;
    }

    if (isExpanded) {
      // Menu was already open, close it
      setIsExpanded(false);
      setSelectedOption(null);
    } else if (!isLongPressRef.current) {
      navigate('/coach');
    }

    isLongPressRef.current = false;
  }, [isExpanded, navigate]);

  // Handle click on expanded options
  const handleOptionClick = useCallback((option: 'camera' | 'gallery') => {
    triggerHaptic('light');
    if (option === 'camera') {
      cameraInputRef.current?.click();
    } else {
      galleryInputRef.current?.click();
    }
    setIsExpanded(false);
    setSelectedOption(null);
  }, []);

  // Handle file selection
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

  // Close on outside tap when expanded
  useEffect(() => {
    if (!isExpanded) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
        setSelectedOption(null);
      }
    };

    // Small delay to avoid immediate trigger
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isExpanded]);

  // Cleanup timer on unmount
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

      {/* Option buttons that pop up - below the main button (top-right position) */}
      {isExpanded && (
        <div className="fixed top-20 right-4 z-50 flex flex-col gap-3 items-end pt-16">
          {/* Camera option */}
          <Button
            size="icon"
            variant={selectedOption === 'camera' ? 'default' : 'secondary'}
            className={cn(
              'h-12 w-12 rounded-full shadow-lg transition-all duration-200',
              selectedOption === 'camera' && 'scale-110 ring-2 ring-primary ring-offset-2'
            )}
            onClick={() => handleOptionClick('camera')}
            onMouseEnter={() => setSelectedOption('camera')}
            onMouseLeave={() => setSelectedOption(null)}
          >
            <Camera className="h-5 w-5" />
          </Button>

          {/* Gallery option */}
          <Button
            size="icon"
            variant={selectedOption === 'gallery' ? 'default' : 'secondary'}
            className={cn(
              'h-12 w-12 rounded-full shadow-lg transition-all duration-200',
              selectedOption === 'gallery' && 'scale-110 ring-2 ring-primary ring-offset-2'
            )}
            onClick={() => handleOptionClick('gallery')}
            onMouseEnter={() => setSelectedOption('gallery')}
            onMouseLeave={() => setSelectedOption(null)}
          >
            <ImageIcon className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Main button - top right corner for easier one-handed use */}
      <Button
        ref={buttonRef}
        size="icon"
        className={cn(
          'fixed top-20 right-4 h-14 w-14 rounded-full shadow-lg z-50 transition-transform duration-200 select-none',
          isExpanded && 'rotate-45 bg-muted text-muted-foreground',
          className
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        <Plus className="h-7 w-7" />
      </Button>
    </>
  );
}
