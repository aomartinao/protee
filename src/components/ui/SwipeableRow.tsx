import { useState, useRef, useCallback, useEffect, useId, type ReactNode } from 'react';
import { Trash2, Edit2 } from 'lucide-react';
import { cn, triggerHaptic } from '@/lib/utils';
import { useSwipeContext } from '@/context/SwipeContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface SwipeableRowProps {
  children: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
  itemName?: string;
}

export function SwipeableRow({ children, onEdit, onDelete, className, itemName }: SwipeableRowProps) {
  const [translateX, setTranslateX] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const swipeContext = useSwipeContext();
  const rowId = useId();

  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTranslateRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isScrollingRef = useRef(false);
  const directionLockedRef = useRef(false);
  const velocityRef = useRef(0);
  const lastXRef = useRef(0);
  const lastTimeRef = useRef(0);

  // Register with swipe context for cross-row coordination
  const closeRow = useCallback(() => {
    setIsAnimating(true);
    setTranslateX(0);
  }, []);

  useEffect(() => {
    if (swipeContext) {
      swipeContext.registerRow(rowId, closeRow);
      return () => swipeContext.unregisterRow(rowId);
    }
  }, [swipeContext, rowId, closeRow]);

  const EDIT_WIDTH = 72;
  const DELETE_WIDTH = 72;
  const ACTION_WIDTH = (onEdit ? EDIT_WIDTH : 0) + (onDelete ? DELETE_WIDTH : 0);
  const FULL_SWIPE_THRESHOLD = ACTION_WIDTH + 60;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!onEdit && !onDelete) return;

    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    startTranslateRef.current = translateX;
    isDraggingRef.current = true;
    isScrollingRef.current = false;
    directionLockedRef.current = false;
    lastXRef.current = touch.clientX;
    lastTimeRef.current = Date.now();
    velocityRef.current = 0;
    setIsAnimating(false);

    // Notify other rows to close when starting to swipe
    if (swipeContext) {
      swipeContext.notifySwipeStart(rowId);
    }
  }, [translateX, onEdit, onDelete, swipeContext, rowId]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;

    const touch = e.touches[0];
    const currentX = touch.clientX;
    const currentY = touch.clientY;
    const currentTime = Date.now();

    const deltaX = currentX - startXRef.current;
    const deltaY = currentY - startYRef.current;

    // Determine direction if not locked yet
    if (!directionLockedRef.current) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Need at least 10px movement to determine direction
      if (absX > 10 || absY > 10) {
        directionLockedRef.current = true;
        // If vertical movement is greater, this is a scroll - don't swipe
        if (absY > absX) {
          isScrollingRef.current = true;
          isDraggingRef.current = false;
          return;
        }
      } else {
        // Not enough movement yet, don't do anything
        return;
      }
    }

    // If we determined this is a scroll, ignore
    if (isScrollingRef.current) return;

    // Calculate velocity
    const deltaTime = currentTime - lastTimeRef.current;
    if (deltaTime > 0) {
      velocityRef.current = (currentX - lastXRef.current) / deltaTime;
    }
    lastXRef.current = currentX;
    lastTimeRef.current = currentTime;

    let newTranslate = startTranslateRef.current + deltaX;

    // Clamp: no swiping right past 0
    if (newTranslate > 0) {
      newTranslate = newTranslate * 0.3; // Rubber band effect
    }

    // Rubber band effect when swiping past actions
    if (newTranslate < -ACTION_WIDTH) {
      const overswipe = Math.abs(newTranslate) - ACTION_WIDTH;
      newTranslate = -(ACTION_WIDTH + overswipe * 0.4);
    }

    setTranslateX(newTranslate);
  }, [ACTION_WIDTH]);

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsAnimating(true);

    const velocity = velocityRef.current;
    const currentTranslate = translateX;

    // Full swipe detection (swipe far + fast enough)
    if (currentTranslate < -FULL_SWIPE_THRESHOLD || (velocity < -0.5 && currentTranslate < -ACTION_WIDTH / 2)) {
      // Full swipe - trigger delete with haptic feedback
      triggerHaptic('warning');
      if (onDelete) {
        setShowDeleteDialog(true);
      }
      setTranslateX(-ACTION_WIDTH);
      return;
    }

    // Determine final position based on position and velocity
    const projectedPosition = currentTranslate + velocity * 150;

    if (projectedPosition < -ACTION_WIDTH / 2) {
      // Snap open
      setTranslateX(-ACTION_WIDTH);
    } else {
      // Snap closed
      setTranslateX(0);
    }
  }, [translateX, ACTION_WIDTH, FULL_SWIPE_THRESHOLD, onDelete]);

  const handleClose = useCallback(() => {
    setIsAnimating(true);
    setTranslateX(0);
  }, []);

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    // If actions are open, close them
    if (translateX < -10) {
      e.preventDefault();
      e.stopPropagation();
      handleClose();
      return;
    }

    // Desktop: toggle actions on click
    if (!isDraggingRef.current && (onEdit || onDelete)) {
      e.preventDefault();
      setIsAnimating(true);
      setTranslateX(translateX === 0 ? -ACTION_WIDTH : 0);
    }
  }, [translateX, ACTION_WIDTH, onEdit, onDelete, handleClose]);

  const handleEditClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit();
      handleClose();
    }
  }, [onEdit, handleClose]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    setShowDeleteDialog(false);
    if (onDelete) {
      triggerHaptic('error');
      setIsAnimating(true);
      setTranslateX(-window.innerWidth);
      setTimeout(() => {
        onDelete();
      }, 250);
    }
  }, [onDelete]);

  const isFullSwipe = translateX < -FULL_SWIPE_THRESHOLD;

  // Calculate stretch: when pulled past ACTION_WIDTH, buttons expand to fill
  const totalReveal = Math.abs(translateX);
  const extraStretch = Math.max(0, totalReveal - ACTION_WIDTH);
  // Distribute extra stretch to delete button (it grows when over-swiping)
  const currentDeleteWidth = DELETE_WIDTH + extraStretch;
  const currentEditWidth = EDIT_WIDTH;

  return (
    <>
      <div
        ref={containerRef}
        className={cn('relative overflow-hidden rounded-xl touch-pan-y', className)}
      >
        {/* Action buttons - positioned to follow the card edge */}
        <div
          className="absolute inset-y-0 right-0 flex"
          style={{
            transform: `translateX(${Math.max(0, translateX + ACTION_WIDTH + extraStretch)}px)`,
            transition: isAnimating ? 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
          }}
        >
          {onEdit && !isFullSwipe && (
            <button
              className="flex items-center justify-center bg-blue-500 text-white active:bg-blue-600 transition-colors"
              style={{ width: currentEditWidth }}
              onClick={handleEditClick}
            >
              <Edit2 className="h-5 w-5" />
            </button>
          )}
          {onDelete && (
            <button
              className={cn(
                "flex items-center justify-center text-white transition-colors",
                isFullSwipe ? "bg-red-600" : "bg-destructive active:bg-red-600"
              )}
              style={{
                width: isFullSwipe ? totalReveal : currentDeleteWidth,
              }}
              onClick={handleDeleteClick}
            >
              <Trash2 className="h-5 w-5" />
              {isFullSwipe && <span className="ml-2 font-medium">Delete</span>}
            </button>
          )}
        </div>

        {/* Main content */}
        <div
          className="relative bg-muted/50"
          style={{
            transform: `translateX(${translateX}px)`,
            transition: isAnimating ? 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleContentClick}
          onTransitionEnd={() => setIsAnimating(false)}
        >
          {children}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Entry</DialogTitle>
            <DialogDescription>
              {itemName
                ? `Are you sure you want to delete "${itemName}"?`
                : 'Are you sure you want to delete this entry?'
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
