import { useState, useEffect, useRef } from 'react';

interface TypewriterTextProps {
  text: string;
  speed?: number; // milliseconds per character
  onComplete?: () => void;
  skipAnimation?: boolean;
  className?: string;
}

export function TypewriterText({
  text,
  speed = 15,
  onComplete,
  skipAnimation = false,
  className,
}: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState(skipAnimation ? text : '');
  const [isComplete, setIsComplete] = useState(skipAnimation);
  const animationRef = useRef<number | null>(null);
  const indexRef = useRef(0);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (skipAnimation) {
      setDisplayedText(text);
      setIsComplete(true);
      return;
    }

    // Reset for new text
    indexRef.current = 0;
    setDisplayedText('');
    setIsComplete(false);

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const elapsed = timestamp - lastTimeRef.current;

      if (elapsed >= speed) {
        lastTimeRef.current = timestamp;
        indexRef.current++;

        if (indexRef.current <= text.length) {
          setDisplayedText(text.slice(0, indexRef.current));
          animationRef.current = requestAnimationFrame(animate);
        } else {
          setIsComplete(true);
          onComplete?.();
        }
      } else {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [text, speed, skipAnimation, onComplete]);

  return (
    <span className={className}>
      {displayedText}
      {!isComplete && (
        <span className="inline-block w-0.5 h-4 bg-foreground/60 ml-0.5 animate-pulse" />
      )}
    </span>
  );
}
