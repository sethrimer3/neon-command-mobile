/**
 * Enhanced victory/defeat screen with detailed match statistics
 */
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Trophy, Skull, HandshakeSlash, Target, Sword, Shield, Clock, Zap } from '@phosphor-icons/react';
import { GameState } from '@/lib/types';

interface EnhancedVictoryScreenProps {
  gameState: GameState;
  onRematch?: () => void;
  onReturnToMenu: () => void;
}

export function EnhancedVictoryScreen({ gameState, onRematch, onReturnToMenu }: EnhancedVictoryScreenProps) {
  const isVictory = gameState.winner === 0;
  const isDraw = gameState.winner === -1;
  const timeLimit = gameState.elapsedTime >= (gameState.matchTimeLimit || 300);
  
  // Calculate stats
  const playerUnitsKilled = gameState.units.filter(u => u.owner === 1 && u.hp <= 0).length;
  const enemyUnitsKilled = gameState.units.filter(u => u.owner === 0 && u.hp <= 0).length;
  const playerBase = gameState.bases.find(b => b.owner === 0);
  const enemyBase = gameState.bases.find(b => b.owner === 1);
  const playerBaseDamageTaken = playerBase ? (playerBase.maxHp - playerBase.hp) : 0;
  const enemyBaseDamageTaken = enemyBase ? (enemyBase.maxHp - enemyBase.hp) : 0;
  
  const matchDuration = Math.floor(gameState.elapsedTime);
  const minutes = Math.floor(matchDuration / 60);
  const seconds = matchDuration % 60;
  
  const Icon = isDraw ? HandshakeSlash : isVictory ? Trophy : Skull;
  const title = isDraw ? 'Draw!' : isVictory ? 'Victory!' : 'Defeat';
  const subtitle = isDraw 
    ? 'Time limit reached! Both players dealt equal damage.' 
    : isVictory 
      ? timeLimit 
        ? 'Time limit reached! Your base took less damage.'
        : 'You destroyed the enemy base!' 
      : timeLimit
        ? 'Time limit reached! Your base took more damage.'
        : 'Your base was destroyed.';
  
  const iconColor = isDraw ? 'text-yellow-400' : isVictory ? 'text-green-400' : 'text-red-400';
  
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-500 p-4">
      <Card className="w-full max-w-lg animate-in zoom-in-95 slide-in-from-bottom-4 duration-700">
        <CardHeader className="text-center border-b border-border">
          <div className="flex justify-center mb-4 animate-in zoom-in-95 duration-700 delay-300">
            <Icon size={64} className={iconColor} weight="fill" />
          </div>
          <CardTitle className="orbitron text-3xl animate-in slide-in-from-top-2 duration-500 delay-300">
            {title}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-500">
            {subtitle}
          </p>
        </CardHeader>
        
        <CardContent className="p-6 space-y-4">
          {/* Match Statistics */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
              <Target size={16} />
              Match Statistics
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Time */}
              <div className="bg-muted/30 p-3 rounded">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock size={14} />
                  <span className="text-xs uppercase tracking-wider">Duration</span>
                </div>
                <div className="font-mono text-lg">
                  {minutes}:{seconds.toString().padStart(2, '0')}
                </div>
              </div>
              
              {/* Photons Spent */}
              <div className="bg-muted/30 p-3 rounded">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Zap size={14} />
                  <span className="text-xs uppercase tracking-wider">Energy Used</span>
                </div>
                <div className="font-mono text-lg text-yellow-400">
                  {Math.round(gameState.elapsedTime * (gameState.players[0]?.incomeRate || 1))}⚡
                </div>
              </div>
              
              {/* Units Killed */}
              <div className="bg-muted/30 p-3 rounded">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Sword size={14} />
                  <span className="text-xs uppercase tracking-wider">Eliminations</span>
                </div>
                <div className="font-mono text-lg text-green-400">
                  {playerUnitsKilled}
                </div>
              </div>
              
              {/* Units Lost */}
              <div className="bg-muted/30 p-3 rounded">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Shield size={14} />
                  <span className="text-xs uppercase tracking-wider">Casualties</span>
                </div>
                <div className="font-mono text-lg text-red-400">
                  {enemyUnitsKilled}
                </div>
              </div>
            </div>
            
            {/* Base Health Comparison */}
            <div className="bg-muted/30 p-3 rounded">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Base Damage Comparison
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-primary">Your Base</span>
                    <span className="font-mono">{playerBase?.hp || 0}/{playerBase?.maxHp || 0}</span>
                  </div>
                  <div className="h-2 bg-background rounded overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${((playerBase?.hp || 0) / (playerBase?.maxHp || 1)) * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-destructive">Enemy Base</span>
                    <span className="font-mono">{enemyBase?.hp || 0}/{enemyBase?.maxHp || 0}</span>
                  </div>
                  <div className="h-2 bg-background rounded overflow-hidden">
                    <div 
                      className="h-full bg-destructive transition-all duration-500"
                      style={{ width: `${((enemyBase?.hp || 0) / (enemyBase?.maxHp || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {onRematch && gameState.vsMode === 'ai' && (
              <Button 
                onClick={onRematch} 
                className="flex-1 orbitron animate-in fade-in slide-in-from-bottom-2 duration-500 delay-700" 
                variant="default"
              >
                Quick Rematch
              </Button>
            )}
            <Button 
              onClick={onReturnToMenu} 
              className="flex-1 orbitron animate-in fade-in slide-in-from-bottom-2 duration-500 delay-700" 
              variant={onRematch ? 'outline' : 'default'}
            >
              Return to Menu
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
