/**
 * Tooltip component for displaying ability and unit information
 */
import { ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

export function Tooltip({ children, content, side = 'top', delayDuration = 200 }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            className="z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
            sideOffset={5}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-border" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

interface UnitTooltipProps {
  unitType: string;
  name: string;
  cost: number;
  hp: number;
  damage: number;
  speed: number;
  ability: string;
  abilityDescription: string;
}

export function UnitTooltip({
  unitType,
  name,
  cost,
  hp,
  damage,
  speed,
  ability,
  abilityDescription,
}: UnitTooltipProps) {
  return (
    <div className="space-y-2 max-w-xs">
      <div className="font-bold text-primary orbitron">{name}</div>
      <div className="grid grid-cols-2 gap-1 text-xs">
        <div>Cost: <span className="text-yellow-400">{cost}⚡</span></div>
        <div>HP: <span className="text-green-400">{hp}</span></div>
        <div>Damage: <span className="text-red-400">{damage}</span></div>
        <div>Speed: <span className="text-blue-400">{speed}</span></div>
      </div>
      <div className="text-xs pt-2 border-t border-border">
        <div className="font-semibold text-primary">{ability}</div>
        <div className="text-muted-foreground">{abilityDescription}</div>
      </div>
    </div>
  );
}

interface AbilityTooltipProps {
  name: string;
  cooldown: number;
  description: string;
  damage?: number;
  range?: number;
  duration?: number;
}

export function AbilityTooltip({
  name,
  cooldown,
  description,
  damage,
  range,
  duration,
}: AbilityTooltipProps) {
  return (
    <div className="space-y-2 max-w-xs">
      <div className="font-bold text-primary orbitron">{name}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
      <div className="grid grid-cols-2 gap-1 text-xs pt-2 border-t border-border">
        <div>Cooldown: <span className="text-cyan-400">{cooldown}s</span></div>
        {damage && <div>Damage: <span className="text-red-400">{damage}</span></div>}
        {range && <div>Range: <span className="text-blue-400">{range}m</span></div>}
        {duration && <div>Duration: <span className="text-green-400">{duration}s</span></div>}
      </div>
    </div>
  );
}
