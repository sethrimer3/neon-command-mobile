/**
 * Loading indicator component with animated spinner
 */
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

export function LoadingSpinner({ size = 'md', className, label }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div
        className={cn(
          'animate-spin rounded-full border-primary border-t-transparent',
          sizeClasses[size]
        )}
        style={{
          animationDuration: '0.8s',
        }}
      />
      {label && (
        <p className="text-sm text-muted-foreground animate-pulse orbitron uppercase tracking-wider">
          {label}
        </p>
      )}
    </div>
  );
}

interface LoadingOverlayProps {
  message?: string;
  progress?: number;
}

export function LoadingOverlay({ message = 'Loading...', progress }: LoadingOverlayProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/95 backdrop-blur-sm z-50 animate-in fade-in duration-300">
      <div className="text-center space-y-4">
        <LoadingSpinner size="lg" />
        <div className="space-y-2">
          <p className="text-lg font-semibold orbitron uppercase tracking-wider text-primary">
            {message}
          </p>
          {progress !== undefined && (
            <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
