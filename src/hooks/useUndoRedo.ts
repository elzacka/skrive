import { useState, useCallback, useRef } from 'react';

interface UndoRedoState {
  content: string;
  cursorPosition: number;
}

interface UseUndoRedoReturn {
  pushState: (content: string, cursorPosition: number) => void;
  undo: () => UndoRedoState | null;
  redo: () => UndoRedoState | null;
  canUndo: boolean;
  canRedo: boolean;
  reset: (content: string) => void;
}

const MAX_HISTORY = 100;

export function useUndoRedo(initialContent: string = ''): UseUndoRedoReturn {
  const [history, setHistory] = useState<UndoRedoState[]>([{ content: initialContent, cursorPosition: 0 }]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const lastPushTime = useRef(0);

  const pushState = useCallback((content: string, cursorPosition: number) => {
    const now = Date.now();
    // Debounce: only push if more than 300ms since last push or content differs significantly
    if (now - lastPushTime.current < 300) {
      // Update current state instead of pushing new one
      setHistory(prev => {
        const newHistory = [...prev];
        newHistory[currentIndex] = { content, cursorPosition };
        return newHistory;
      });
      return;
    }

    lastPushTime.current = now;

    setHistory(prev => {
      // Remove any future states (redo history)
      const newHistory = prev.slice(0, currentIndex + 1);
      // Add new state
      newHistory.push({ content, cursorPosition });
      // Limit history size
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
        return newHistory;
      }
      return newHistory;
    });
    setCurrentIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [currentIndex]);

  const undo = useCallback((): UndoRedoState | null => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      return history[newIndex];
    }
    return null;
  }, [currentIndex, history]);

  const redo = useCallback((): UndoRedoState | null => {
    if (currentIndex < history.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      return history[newIndex];
    }
    return null;
  }, [currentIndex, history]);

  const reset = useCallback((content: string) => {
    setHistory([{ content, cursorPosition: 0 }]);
    setCurrentIndex(0);
    lastPushTime.current = 0;
  }, []);

  return {
    pushState,
    undo,
    redo,
    canUndo: currentIndex > 0,
    canRedo: currentIndex < history.length - 1,
    reset
  };
}
