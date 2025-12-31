/**
 * Pulse animation component for UI elements
 */
import { ReactNode } from 'react';

interface PulseProps {
  children: ReactNode;
  color?: string;
  duration?: number;
  scale?: number;
}

export function Pulse({ children, color = 'currentColor', duration = 2, scale = 1.05 }: PulseProps) {
  return (
    <div className="relative inline-block">
      {/* Pulsing glow layer */}
      <div
        className="absolute inset-0 rounded-lg"
        style={{
          animation: `pulse-glow ${duration}s ease-in-out infinite`,
          backgroundColor: color,
          filter: 'blur(8px)',
          opacity: 0.3,
        }}
      />
      
      {/* Content with subtle scale pulse */}
      <div
        style={{
          animation: `pulse-scale ${duration}s ease-in-out infinite`,
        }}
      >
        {children}
      </div>
      
      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.1);
          }
        }
        
        @keyframes pulse-scale {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(${scale});
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Glitch text effect component
 */
interface GlitchTextProps {
  children: string;
  className?: string;
}

export function GlitchText({ children, className = '' }: GlitchTextProps) {
  return (
    <div className={`relative inline-block ${className}`}>
      <span className="relative z-10">{children}</span>
      <span
        className="absolute top-0 left-0 opacity-70 animate-glitch-1"
        style={{ color: 'oklch(0.65 0.25 240)' }}
      >
        {children}
      </span>
      <span
        className="absolute top-0 left-0 opacity-70 animate-glitch-2"
        style={{ color: 'oklch(0.62 0.28 25)' }}
      >
        {children}
      </span>
      
      <style>{`
        @keyframes glitch-1 {
          0% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(-2px, -2px); }
          60% { transform: translate(2px, 2px); }
          80% { transform: translate(2px, -2px); }
          100% { transform: translate(0); }
        }
        
        @keyframes glitch-2 {
          0% { transform: translate(0); }
          20% { transform: translate(2px, -2px); }
          40% { transform: translate(2px, 2px); }
          60% { transform: translate(-2px, -2px); }
          80% { transform: translate(-2px, 2px); }
          100% { transform: translate(0); }
        }
        
        .animate-glitch-1 {
          animation: glitch-1 0.3s infinite;
          clip-path: polygon(0 0, 100% 0, 100% 45%, 0 45%);
        }
        
        .animate-glitch-2 {
          animation: glitch-2 0.3s infinite reverse;
          clip-path: polygon(0 55%, 100% 55%, 100% 100%, 0 100%);
        }
      `}</style>
    </div>
  );
}

/**
 * Scan line effect component for retro aesthetic
 */
export function ScanLines() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 opacity-5">
      <div
        className="h-full w-full"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, currentColor 2px, currentColor 4px)',
          animation: 'scan 8s linear infinite',
        }}
      />
      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); }
          100% { transform: translateY(100%); }
        }
      `}</style>
    </div>
  );
}
