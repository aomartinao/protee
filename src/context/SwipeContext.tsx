import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';

interface SwipeContextType {
  registerRow: (id: string, closeCallback: () => void) => void;
  unregisterRow: (id: string) => void;
  notifySwipeStart: (id: string) => void;
}

const SwipeContext = createContext<SwipeContextType | null>(null);

export function SwipeProvider({ children }: { children: ReactNode }) {
  const rowsRef = useRef<Map<string, () => void>>(new Map());

  const registerRow = useCallback((id: string, closeCallback: () => void) => {
    rowsRef.current.set(id, closeCallback);
  }, []);

  const unregisterRow = useCallback((id: string) => {
    rowsRef.current.delete(id);
  }, []);

  const notifySwipeStart = useCallback((id: string) => {
    // Close all other rows
    rowsRef.current.forEach((closeCallback, rowId) => {
      if (rowId !== id) {
        closeCallback();
      }
    });
  }, []);

  return (
    <SwipeContext.Provider value={{ registerRow, unregisterRow, notifySwipeStart }}>
      {children}
    </SwipeContext.Provider>
  );
}

export function useSwipeContext() {
  return useContext(SwipeContext);
}
