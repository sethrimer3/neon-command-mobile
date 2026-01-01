/**
 * Unit tooltip component displaying unit stats and abilities
 */
import { UnitType, UNIT_DEFINITIONS, UnitModifier } from '@/lib/types';
import { Card, CardContent } from './ui/card';

interface UnitTooltipProps {
  unitType: UnitType;
  position: { x: number; y: number };
  damageMultiplier?: number;
  hp?: number;
  maxHp?: number;
  abilityCooldown?: number;
  armor?: number;
}

// Helper to get modifier icon
function getModifierIcon(modifier: UnitModifier): string {
  switch (modifier) {
    case 'melee': return '⚔️';
    case 'ranged': return '🏹';
    case 'flying': return '✈️';
    case 'small': return '🐜';
    case 'healing': return '⚕️';
  }
}

// Helper to get modifier color
function getModifierColor(modifier: UnitModifier): string {
  switch (modifier) {
    case 'melee': return 'text-red-500';
    case 'ranged': return 'text-blue-500';
    case 'flying': return 'text-cyan-500';
    case 'small': return 'text-yellow-500';
    case 'healing': return 'text-green-500';
  }
}

export function UnitTooltip({ 
  unitType, 
  position, 
  damageMultiplier = 1.0,
  hp,
  maxHp,
  abilityCooldown = 0,
  armor
}: UnitTooltipProps) {
  const def = UNIT_DEFINITIONS[unitType];
  
  return (
    <div 
      className="fixed pointer-events-none z-50 animate-in fade-in duration-150"
      style={{
        left: position.x + 20,
        top: position.y - 10,
      }}
    >
      <Card className="bg-background/95 backdrop-blur-sm border-primary/50 min-w-[200px]">
        <CardContent className="p-3 space-y-2">
          {/* Unit Name */}
          <div className="font-bold text-primary text-sm uppercase tracking-wider">
            {def.name}
          </div>
          
          {/* Modifiers */}
          {def.modifiers.length > 0 && (
            <div className="flex gap-1 items-center">
              {def.modifiers.map((modifier, idx) => (
                <span
                  key={idx}
                  className={`text-base ${getModifierColor(modifier)}`}
                  title={modifier}
                >
                  {getModifierIcon(modifier)}
                </span>
              ))}
            </div>
          )}
          
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {/* Health */}
            {hp !== undefined && maxHp !== undefined && (
              <>
                <div className="text-muted-foreground">Health:</div>
                <div className="text-right font-mono">
                  <span className={
                    hp / maxHp > 0.6 ? 'text-green-400' : 
                    hp / maxHp > 0.3 ? 'text-yellow-400' : 
                    'text-red-400'
                  }>
                    {Math.ceil(hp)}
                  </span>
                  <span className="text-muted-foreground">/{maxHp}</span>
                </div>
              </>
            )}
            
            {/* Attack Type */}
            {def.attackType !== 'none' && (
              <>
                <div className="text-muted-foreground">Attack:</div>
                <div className="text-right capitalize">{def.attackType}</div>
              </>
            )}
            
            {/* Damage */}
            {def.attackDamage > 0 && (
              <>
                <div className="text-muted-foreground">Damage:</div>
                <div className="text-right font-mono">
                  {Math.round(def.attackDamage * damageMultiplier)}
                  {damageMultiplier > 1.0 && (
                    <span className="text-primary text-xs ml-1">
                      ({damageMultiplier.toFixed(1)}x)
                    </span>
                  )}
                </div>
              </>
            )}
            
            {/* Range */}
            {def.attackRange > 0 && (
              <>
                <div className="text-muted-foreground">Range:</div>
                <div className="text-right font-mono">{def.attackRange}m</div>
              </>
            )}
            
            {/* Armor */}
            <div className="text-muted-foreground">Armor:</div>
            <div className="text-right font-mono text-blue-400">
              {armor !== undefined ? armor : def.armor}
            </div>
            
            {/* Speed */}
            <div className="text-muted-foreground">Speed:</div>
            <div className="text-right font-mono">{def.moveSpeed}m/s</div>
            
            {/* Cost */}
            <div className="text-muted-foreground">Cost:</div>
            <div className="text-right font-mono text-yellow-400">{def.cost}⚡</div>
          </div>
          
          {/* Ability */}
          {def.abilityName && (
            <div className="pt-2 border-t border-border/50">
              <div className="text-xs font-semibold text-primary mb-1">
                Ability: {def.abilityName}
              </div>
              <div className="text-xs text-muted-foreground">
                Cooldown: {def.abilityCooldown}s
                {abilityCooldown > 0 && (
                  <span className="text-yellow-400 ml-2">
                    ({abilityCooldown.toFixed(1)}s remaining)
                  </span>
                )}
                {abilityCooldown === 0 && (
                  <span className="text-green-400 ml-2">
                    ✓ Ready
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
