/**
 * Tutorial hints system for new players
 */
import { Card, CardContent } from './ui/card';
import { X } from '@phosphor-icons/react';
import { Button } from './ui/button';

interface TutorialHintProps {
  title: string;
  message: string;
  position?: { x: number; y: number };
  onDismiss: () => void;
}

export function TutorialHint({ title, message, position, onDismiss }: TutorialHintProps) {
  const style = position ? {
    position: 'fixed' as const,
    left: position.x,
    top: position.y,
  } : {};

  return (
    <div 
      className="z-50 animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={style}
    >
      <Card className="bg-background/95 backdrop-blur-sm border-primary/50 max-w-[300px]">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-bold text-primary text-sm uppercase tracking-wider">
              {title}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onDismiss}
            >
              <X size={16} />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {message}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export const TUTORIAL_HINTS = {
  firstUnit: {
    title: '💡 Spawn Units',
    message: 'Select your base (blue square), then swipe anywhere in different directions to spawn units. Each direction spawns a different unit type.',
  },
  selectUnits: {
    title: '💡 Select Units',
    message: 'Click and drag to select multiple units. Click on a unit to select it individually.',
  },
  moveCommand: {
    title: '💡 Move Units',
    message: 'Select units and click on the battlefield to move them. They will follow a telegraphed path shown to both players.',
  },
  useAbility: {
    title: '💡 Use Abilities',
    message: 'Select units and drag from them in a direction to use their special ability. Each unit type has a unique ability!',
  },
  baseAbility: {
    title: '💡 Base Laser',
    message: 'Select your base, click to set a target, then swipe from the target dot to fire a powerful laser beam!',
  },
  promotions: {
    title: '💡 Distance Bonuses',
    message: 'Units gain damage multipliers as they travel. The longer the journey, the stronger they become!',
  },
  controlGroups: {
    title: '💡 Control Groups',
    message: 'Press Ctrl+Number (1-8) to assign selected units to a control group. Press Number alone to recall them.',
  },
  cameraControls: {
    title: '💡 Camera',
    message: 'Use mouse wheel to zoom, WASD to pan, and R to reset. Perfect for large battlefields!',
  },
};
