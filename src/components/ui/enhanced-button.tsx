/**
 * Enhanced button component with improved hover effects and animations
 */
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface EnhancedButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  glowColor?: string;
}

const EnhancedButton = forwardRef<HTMLButtonElement, EnhancedButtonProps>(
  ({ className, variant = 'default', size = 'default', glowColor, children, ...props }, ref) => {
    const baseStyles = 'orbitron uppercase tracking-wider transition-all duration-300 relative overflow-hidden group';
    
    const sizeStyles = {
      default: 'h-12 text-base px-6',
      sm: 'h-10 text-sm px-4',
      lg: 'h-14 text-lg px-8',
    };

    const variantStyles = {
      default: 'bg-primary text-primary-foreground hover:bg-primary/90',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      outline: 'border border-primary text-primary hover:bg-primary/10',
      ghost: 'text-primary hover:bg-primary/5',
    };

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          sizeStyles[size],
          variantStyles[variant],
          'before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent',
          'before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700',
          'hover:scale-105 hover:shadow-lg active:scale-95',
          glowColor && `hover:shadow-[0_0_20px_${glowColor}]`,
          className
        )}
        {...props}
      >
        {/* Glow effect on hover */}
        <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl bg-current" />
        
        {/* Content */}
        <span className="relative z-10 flex items-center justify-center gap-2">
          {children}
        </span>
        
        {/* Corner accents */}
        <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-current opacity-50 group-hover:opacity-100 transition-opacity" />
        <span className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-current opacity-50 group-hover:opacity-100 transition-opacity" />
        <span className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-current opacity-50 group-hover:opacity-100 transition-opacity" />
        <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-current opacity-50 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }
);

EnhancedButton.displayName = 'EnhancedButton';

export { EnhancedButton };
