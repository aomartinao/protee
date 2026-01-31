import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Camera, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store/useStore';
import { compressImage } from '@/lib/utils';
import { cn } from '@/lib/utils';

const LONG_PRESS_DURATION = 400; // ms to trigger long press
const OPTION_DISTANCE = 70; // distance from center to options

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

  // Get button center position for calculating touch position relative to button
  const getButtonCenter = useCallback(() => {
    if (!buttonRef.current) return { x: 0, y: 0 };
    const rect = buttonRef.current.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }, []);

  // Determine which option is selected based on touch position
  const getSelectedOption = useCallback((touchX: number, touchY: number): SelectedOption => {
    const center = getButtonCenter();
    const dx = touchX - center.x;
    const dy = touchY - center.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Need to be far enough from center to select
    if (distance < 30) return null;

    // Camera is to the left-up, Gallery is straight up
    // Using angle to determine selection
    const angle = Math.atan2(-dy, dx) * (180 / Math.PI); // -dy because y increases downward

    // Camera: upper-left area (roughly 100-170 degrees)
    // Gallery: upper-right area (roughly 10-80 degrees)
    if (angle > 100 && angle <= 180) return 'camera';
    if (angle > 0 && angle <= 80) return 'gallery';

    return null;
  }, [getButtonCenter]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    hasMovedRef.current = false;
    isLongPressRef.current = false;

    // Start long press timer
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setIsExpanded(true);
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
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

    // If expanded, determine selected option based on touch position
    if (isExpanded) {
      const option = getSelectedOption(touch.clientX, touch.clientY);
      setSelectedOption(option);
    }
  }, [isExpanded, getSelectedOption]);

  const handleTouchEnd = useCallback(() => {
    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isExpanded) {
      // Handle selected option
      if (selectedOption === 'camera') {
        cameraInputRef.current?.click();
      } else if (selectedOption === 'gallery') {
        galleryInputRef.current?.click();
      }
      // Close menu
      setIsExpanded(false);
      setSelectedOption(null);
    } else if (!hasMovedRef.current && !isLongPressRef.current) {
      // Simple tap - navigate to coach
      navigate('/coach');
    }

    touchStartRef.current = null;
    hasMovedRef.current = false;
    isLongPressRef.current = false;
  }, [isExpanded, selectedOption, navigate]);

  // Handle mouse events for desktop
  const handleMouseDown = useCallback(() => {
    hasMovedRef.current = false;
    isLongPressRef.current = false;

    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setIsExpanded(true);
    }, LONG_PRESS_DURATION);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isExpanded) {
      if (selectedOption === 'camera') {
        cameraInputRef.current?.click();
      } else if (selectedOption === 'gallery') {
        galleryInputRef.current?.click();
      }
      setIsExpanded(false);
      setSelectedOption(null);
    } else if (!isLongPressRef.current) {
      navigate('/coach');
    }

    isLongPressRef.current = false;
  }, [isExpanded, selectedOption, navigate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isExpanded) {
      const option = getSelectedOption(e.clientX, e.clientY);
      setSelectedOption(option);
    }
  }, [isExpanded, getSelectedOption]);

  // Handle click on expanded options (for desktop hover)
  const handleOptionClick = useCallback((option: 'camera' | 'gallery') => {
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

      {/* Option buttons that pop up */}
      {isExpanded && (
        <>
          {/* Camera option - upper left */}
          <Button
            size="icon"
            variant={selectedOption === 'camera' ? 'default' : 'secondary'}
            className={cn(
              'fixed h-12 w-12 rounded-full shadow-lg z-50 transition-all duration-200',
              selectedOption === 'camera' && 'scale-110 ring-2 ring-primary ring-offset-2'
            )}
            style={{
              bottom: `calc(6rem + ${OPTION_DISTANCE}px)`,
              right: `calc(1rem + ${OPTION_DISTANCE * 0.7}px)`,
            }}
            onClick={() => handleOptionClick('camera')}
            onMouseEnter={() => setSelectedOption('camera')}
            onMouseLeave={() => setSelectedOption(null)}
          >
            <Camera className="h-5 w-5" />
          </Button>

          {/* Gallery option - upper right */}
          <Button
            size="icon"
            variant={selectedOption === 'gallery' ? 'default' : 'secondary'}
            className={cn(
              'fixed h-12 w-12 rounded-full shadow-lg z-50 transition-all duration-200',
              selectedOption === 'gallery' && 'scale-110 ring-2 ring-primary ring-offset-2'
            )}
            style={{
              bottom: `calc(6rem + ${OPTION_DISTANCE}px)`,
              right: `calc(1rem - ${OPTION_DISTANCE * 0.3}px)`,
            }}
            onClick={() => handleOptionClick('gallery')}
            onMouseEnter={() => setSelectedOption('gallery')}
            onMouseLeave={() => setSelectedOption(null)}
          >
            <ImageIcon className="h-5 w-5" />
          </Button>
        </>
      )}

      {/* Main button */}
      <Button
        ref={buttonRef}
        size="icon"
        className={cn(
          'fixed bottom-24 right-4 h-14 w-14 rounded-full shadow-lg z-50 transition-transform duration-200 select-none touch-none',
          isExpanded && 'rotate-45 bg-muted text-muted-foreground',
          className
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          if (isExpanded) {
            setSelectedOption(null);
          }
        }}
      >
        <Plus className="h-7 w-7" />
      </Button>
    </>
  );
}
