/**
 * Smooth screen transition component with fade effects
 */
import { ReactNode } from 'react';

interface ScreenTransitionProps {
  children: ReactNode;
  className?: string;
}

export function ScreenTransition({ children, className = '' }: ScreenTransitionProps) {
  return (
    <div className={`absolute inset-0 animate-in fade-in duration-500 ${className}`}>
      {children}
    </div>
  );
}

export function ScreenTransitionFast({ children, className = '' }: ScreenTransitionProps) {
  return (
    <div className={`absolute inset-0 animate-in fade-in duration-300 ${className}`}>
      {children}
    </div>
  );
}

export function ScreenTransitionSlow({ children, className = '' }: ScreenTransitionProps) {
  return (
    <div className={`absolute inset-0 animate-in fade-in duration-700 ${className}`}>
      {children}
    </div>
  );
}

export function ScreenTransitionSlide({ children, className = '', direction = 'bottom' }: ScreenTransitionProps & { direction?: 'bottom' | 'top' | 'left' | 'right' }) {
  const slideClass = {
    bottom: 'slide-in-from-bottom-8',
    top: 'slide-in-from-top-8',
    left: 'slide-in-from-left-8',
    right: 'slide-in-from-right-8',
  }[direction];

  return (
    <div className={`absolute inset-0 animate-in fade-in ${slideClass} duration-500 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Menu transition with directional slide animations
 * - forward: slides in from right (for entering sub-menus)
 * - back: slides in from left (for returning to main menu)
 */
export function MenuTransition({ 
  children, 
  className = '', 
  direction = 'forward' 
}: ScreenTransitionProps & { direction?: 'forward' | 'back' }) {
  const slideClass = direction === 'forward' 
    ? 'slide-in-from-right-full' 
    : 'slide-in-from-left-full';

  return (
    <div className={`absolute inset-0 animate-in fade-in ${slideClass} duration-500 ${className}`}>
      {children}
    </div>
  );
}
