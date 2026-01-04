import { useEffect, useState } from 'react';
import { GameState } from '../lib/types';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface VictoryScreenProps {
  gameState: GameState;
  onContinue: () => void;
  onRematch?: () => void;
}

interface StatDisplay {
  label: string;
  value: string | number;
  visible: boolean;
}

export function VictoryScreen({ gameState, onContinue, onRematch }: VictoryScreenProps) {
  const [visibleStats, setVisibleStats] = useState<number>(0);
  const [showButton, setShowButton] = useState(false);

  const isVictory = gameState.winner === 0;
  const isDraw = gameState.winner === -1;
  const title = isDraw ? 'Draw!' : isVictory ? 'Victory!' : 'Loss...';
  
  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Prepare stats to display
  const stats: StatDisplay[] = [];
  
  if (gameState.matchStats) {
    const duration = (Date.now() - gameState.matchStats.startTime) / 1000;
    stats.push(
      { label: 'Match Duration', value: formatTime(duration), visible: false },
      { label: 'Units Trained', value: gameState.matchStats.unitsTrainedByPlayer, visible: false },
      { label: 'Units Eliminated', value: gameState.matchStats.unitsKilledByPlayer, visible: false },
      { label: 'Damage Dealt', value: Math.round(gameState.matchStats.damageDealtByPlayer), visible: false },
      { label: 'Photons Spent', value: gameState.matchStats.photonsSpentByPlayer, visible: false },
    );
  }

  useEffect(() => {
    if (stats.length === 0) {
      // If no stats, show button immediately
      setShowButton(true);
      return;
    }

    // Show stats one at a time
    const timer = setInterval(() => {
      setVisibleStats((prev) => {
        if (prev >= stats.length) {
          clearInterval(timer);
          // Show button after all stats are visible
          setTimeout(() => setShowButton(true), 300);
          return prev;
        }
        return prev + 1;
      });
    }, 400); // Show each stat every 400ms

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-500">
      <Card className="w-[500px] max-w-[90vw] animate-in zoom-in-95 slide-in-from-bottom-4 duration-700">
        <CardHeader>
          <CardTitle 
            className={`orbitron text-4xl text-center font-bold animate-in slide-in-from-top-2 duration-500 delay-300 ${
              isVictory ? 'text-green-400' : isDraw ? 'text-yellow-400' : 'text-red-400'
            }`}
            style={{
              textShadow: isVictory 
                ? '0 0 20px rgba(74, 222, 128, 0.6), 0 0 40px rgba(74, 222, 128, 0.3)' 
                : isDraw
                ? '0 0 20px rgba(250, 204, 21, 0.6), 0 0 40px rgba(250, 204, 21, 0.3)'
                : '0 0 20px rgba(248, 113, 113, 0.6), 0 0 40px rgba(248, 113, 113, 0.3)'
            }}
          >
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Subtitle message */}
          <p className="text-center text-muted-foreground animate-in fade-in slide-in-from-bottom-2 duration-500 delay-500">
            {isDraw 
              ? 'Time limit reached! Both players dealt equal damage.' 
              : isVictory 
                ? gameState.elapsedTime >= (gameState.matchTimeLimit || 300) 
                  ? 'Time limit reached! Your base took less damage.'
                  : 'You destroyed the enemy base!' 
                : gameState.elapsedTime >= (gameState.matchTimeLimit || 300)
                  ? 'Time limit reached! Your base took more damage.'
                  : 'Your base was destroyed.'}
          </p>

          {/* Stats Section */}
          {stats.length > 0 && (
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="text-center text-sm font-semibold text-muted-foreground orbitron uppercase tracking-wider">
                Match Statistics
              </h3>
              <div className="space-y-2">
                {stats.map((stat, index) => (
                  <div
                    key={stat.label}
                    className={`flex justify-between items-center px-4 py-2 rounded-md bg-secondary/30 transition-all duration-300 ${
                      index < visibleStats ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
                    }`}
                    style={{
                      transitionDelay: `${index * 50}ms`
                    }}
                  >
                    <span className="text-sm font-medium">{stat.label}</span>
                    <span className="text-lg font-bold orbitron">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Buttons */}
          <div 
            className={`flex gap-2 transition-all duration-500 ${
              showButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            {onRematch && (
              <Button 
                onClick={onRematch} 
                className="flex-1 orbitron" 
                variant="default"
              >
                Quick Rematch
              </Button>
            )}
            <Button 
              onClick={onContinue} 
              className={`${onRematch ? 'flex-1' : 'w-full'} orbitron`}
              variant={onRematch ? 'outline' : 'default'}
            >
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
