import { useEffect } from 'react';

export interface KeyboardActions {
  onEscape?: () => void;
  onSpace?: () => void;
  onEnter?: () => void;
  onSelectAll?: () => void; // Ctrl+A or Cmd+A
  onDeselect?: () => void; // Esc or D
  onStop?: () => void; // S
  onAttackMove?: () => void; // A
  onPause?: () => void; // P
}

const GAME_CONTROL_KEYS = ['Escape', ' ', 'Enter', 'a', 'A', 'd', 'D', 's', 'S', 'p', 'P'];

export function useKeyboardControls(actions: KeyboardActions, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default for game controls
      const isGameKey = GAME_CONTROL_KEYS.includes(e.key);
      if (isGameKey) {
        e.preventDefault();
      }

      // Handle Ctrl/Cmd combinations
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        actions.onSelectAll?.();
        e.preventDefault();
        return;
      }

      // Handle individual keys
      switch (e.key) {
        case 'Escape':
          actions.onEscape?.();
          break;
        case ' ':
          actions.onSpace?.();
          break;
        case 'Enter':
          actions.onEnter?.();
          break;
        case 'd':
        case 'D':
          actions.onDeselect?.();
          break;
        case 's':
        case 'S':
          actions.onStop?.();
          break;
        case 'a':
        case 'A':
          if (!e.ctrlKey && !e.metaKey) {
            actions.onAttackMove?.();
          }
          break;
        case 'p':
        case 'P':
          actions.onPause?.();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, enabled]);
}
