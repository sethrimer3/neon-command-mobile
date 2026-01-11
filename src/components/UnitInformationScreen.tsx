/**
 * Unit Information Screen
 * Displays comprehensive information about all units organized by faction
 * Includes stats, modifiers, attack descriptions, and ability descriptions
 */
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, Info } from '@phosphor-icons/react';
import { 
  UnitType, 
  UNIT_DEFINITIONS, 
  FactionType, 
  FACTION_DEFINITIONS,
  UnitModifier 
} from '../lib/types';

interface UnitInformationScreenProps {
  onBack: () => void;
}

// Helper function to get ability description with damage stats
function getAbilityDescription(unitType: UnitType): string {
  const abilityDescriptions: Record<UnitType, string> = {
    // Radiant faction
    marine: 'Fires 10 rapid shots in a cone, each dealing 2 damage (affected by damage multiplier) to enemies in the target direction (max range: 8m). Also fires a laser dealing 10 damage.',
    warrior: 'Compresses the sword into one point, then throws five knives at -10°, -5°, 0°, 5°, and 10° in quick succession. Knife speed scales with the drag distance and each knife deals 6 damage (affected by damage multiplier).',
    tank: 'Creates a protective shield dome with 4m radius for 5 seconds, reducing incoming ranged damage by 50% for friendly units inside (melee damage is unaffected). Also fires a laser dealing 10 damage.',
    scout: 'Always cloaked and cannot be targeted by enemies. Activating the ability reveals the Dagger, throws a knife after 2s in the cast direction (8 damage, affected by damage multiplier), then remains visible for 1s before recloaking. Also fires a laser dealing 10 damage.',
    artillery: 'Launches a bombardment at target location after 1.5s delay, dealing area damage. Also fires a laser dealing 10 damage.',
    medic: 'Heals all friendly units within 5m radius for 50 HP and bases for 100 HP. Also fires a laser dealing 10 damage.',
    interceptor: 'Fires up to 6 missiles at nearby enemies in target direction, each dealing 15 damage (max range: 12m). Also fires a laser dealing 10 damage.',
    guardian: 'Fires a laser dealing 10 damage. Protect allies ability (placeholder - full implementation pending).',
    marksman: 'Fires a precise long-range shot at the furthest enemy in direction, dealing 50 damage (max range: 18m). Also fires a laser dealing 10 damage.',
    engineer: 'Deploys a stationary turret at target location that lasts 10 seconds and attacks enemies. Also fires a laser dealing 10 damage.',
    skirmisher: 'Quickly retreats 8m in opposite direction and cloaks for 2 seconds. Also fires a laser dealing 10 damage.',
    paladin: 'Delivers a holy strike in a cone, dealing 40 damage to all enemies within 6m in target direction. Also fires a laser dealing 10 damage.',
    
    // Aurum faction
    snaker: 'Jumps in a line to target position, dealing 20 damage to all enemies along the path (max range: 10m). Also fires a laser dealing 10 damage.',
    berserker: 'Enters rage mode for 6 seconds, increasing damage by 80%. Also fires a laser dealing 10 damage.',
    assassin: 'Teleports next to the nearest enemy within 3m of the target point, dealing 45 damage and cloaking for 1.5s. Also fires a laser dealing 10 damage.',
    juggernaut: 'Slams the ground, dealing 35 damage to enemies within 4m and slowing them to 20% speed for 3s. Also fires a laser dealing 10 damage.',
    striker: 'Spins in a whirlwind, dealing 30 damage to all enemies within 3m. Also fires a laser dealing 10 damage.',
    gladiator: 'Executes a lethal strike on nearby low-health enemy, dealing 50% of target\'s current HP (max 100 damage, range: 3m). Also fires a laser dealing 10 damage.',
    ravager: 'Life steal attack - damages all enemies within 3m for 15 damage each and heals for 50% of total damage dealt. Also fires a laser dealing 10 damage.',
    warlord: 'Battle cry buffs all allies within 6m, increasing their damage by 50% for 5 seconds. Also fires a laser dealing 10 damage.',
    duelist: 'Counter-attack stance - creates a 2m shield for 2 seconds that reduces melee damage by 70% and deals 25 damage to nearby enemies. Also fires a laser dealing 10 damage.',
    reaper: 'Soul strike drains enemies in a narrow line up to 9m, dealing 25 damage and healing for 40% of damage dealt. Also fires a laser dealing 10 damage.',
    oracle: 'Divine restoration heals allies within 6m for 80 HP and bases for 160 HP. Also fires a laser dealing 10 damage.',
    harbinger: 'Phases forward 8m, dealing 28 damage to enemies along the path. Also fires a laser dealing 10 damage.',
    
    // Solari faction
    flare: 'Fires a focused solar beam up to 7m, dealing 35 damage to enemies in a narrow line (bases take 50% damage). Also fires a laser dealing 10 damage.',
    nova: 'Stellar burst detonates around the Nova, dealing 40 damage to enemies within 3.5m. Also fires a laser dealing 10 damage.',
    eclipse: 'Shadow veil cloaks allies within 6m for 5 seconds. Also fires a laser dealing 10 damage.',
    corona: 'Unleashes a radiation cone up to 7m, dealing 32 damage in the forward arc. Also fires a laser dealing 10 damage.',
    supernova: 'After a 2s delay, detonates at target location for 70 damage to enemies and 100 to bases within 5m. Also fires a laser dealing 10 damage.',
    zenith: 'Solar blessing heals allies within 5.5m for 60 HP, heals bases for 90 HP, and grants +20% damage for 4s. Also fires a laser dealing 10 damage.',
    pulsar: 'Dives to a target within 10m, dealing 35 damage to enemies within 2.5m on impact. Also fires a laser dealing 10 damage.',
    celestial: 'Charges up to 8m toward the target, dealing 38 damage to enemies along the path. Also fires a laser dealing 10 damage.',
    voidwalker: 'Teleports to target location within 12m range, leaving void energy at both positions. Also fires a laser dealing 10 damage.',
    chronomancer: 'Slows all enemies within 7m radius, reducing their move speed to 30% for 4 seconds. Also fires a laser dealing 10 damage.',
    nebula: 'Creates a cosmic barrier with 3m radius for 6 seconds that reduces melee damage by 70% for allies inside.',
    quasar: 'Delayed area ability - after 2.5s, deals 60 damage to enemies and 80 to bases within 4m radius.',
    luminary: 'Creates a gravity well at target location (8m radius) that pulls enemies toward the center for 3 seconds. Enemies within 2.5m are held in place. Also fires a laser dealing 10 damage.',
    photon: 'Chain lightning attack - hits the first enemy in direction, then chains up to 5 times to nearby enemies within 6m. Each jump deals 30 damage with 20% falloff. Also fires a laser dealing 10 damage.',
    starborn: 'Calls down an orbital strike beam at target location after 1.5s delay. The beam lasts 2 seconds, dealing 50 total damage to enemies within 2m radius (bases take 75 total). Also fires a laser dealing 10 damage.',
    prism: 'Splits light into 5 beams that fan out in a 45° spread pattern, each dealing 15 damage to enemies in their path (9m length). Also fires a laser dealing 10 damage.',
    
    // Special units
    miningDrone: 'Automatically mines resources from assigned deposit and returns them to the depot.',
  };
  
  return abilityDescriptions[unitType] || 'Generic laser ability dealing 10 damage in target direction.';
}

// Helper function to get attack description
function getAttackDescription(unitType: UnitType): string {
  const def = UNIT_DEFINITIONS[unitType];
  
  if (def.attackType === 'none') {
    return 'This unit does not have a normal attack.';
  }

  if (unitType === 'warrior') {
    return `Melee combo: Performs three swings. Swings 1-2 hit a 180° arc in front, swing 3 hits a full 360° radius. Each swing deals ${def.attackDamage} damage within ${def.attackRange}m (ignores armor).`;
  }
  
  const attackTypeText = def.attackType === 'melee' ? 'Melee attack' : 'Ranged attack';
  const armorText = def.attackType === 'melee' 
    ? ' (ignores armor)' 
    : ' (reduced by target armor)';
  
  return `${attackTypeText}: Deals ${def.attackDamage} damage at ${def.attackRange}m range with ${def.attackRate} attacks per second${armorText}.`;
}

// Helper function to render modifier badges
function ModifierBadge({ modifier }: { modifier: UnitModifier }) {
  const colors: Record<UnitModifier, string> = {
    melee: 'bg-red-500/20 text-red-400 border-red-500/50',
    ranged: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    flying: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50',
    small: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    healing: 'bg-green-500/20 text-green-400 border-green-500/50',
  };
  
  const icons: Record<UnitModifier, string> = {
    melee: '⚔️',
    ranged: '🏹',
    flying: '✈️',
    small: '🐜',
    healing: '⚕️',
  };
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border rounded ${colors[modifier]}`}>
      {icons[modifier]} {modifier.charAt(0).toUpperCase() + modifier.slice(1)}
    </span>
  );
}

// Component for displaying a single unit's information
function UnitCard({ unitType, playerColor }: { unitType: UnitType; playerColor: string }) {
  const def = UNIT_DEFINITIONS[unitType];
  
  return (
    <div className="border border-border rounded-lg p-4 hover:bg-muted/20 transition-colors">
      <div className="flex items-start gap-4">
        {/* Unit Icon */}
        <div className="flex-shrink-0 w-16 h-16 rounded bg-muted/50 flex items-center justify-center border border-border">
          <div className="text-3xl">{getUnitIcon(unitType)}</div>
        </div>
        
        {/* Unit Information */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="text-lg font-bold text-foreground">{def.name}</h4>
            <span className="text-sm font-semibold text-primary px-2 py-1 bg-primary/10 rounded">
              {def.cost} ⚡
            </span>
          </div>
          
          {/* Modifiers */}
          <div className="flex flex-wrap gap-1 mb-3">
            {def.modifiers.map((modifier) => (
              <ModifierBadge key={modifier} modifier={modifier} />
            ))}
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3 text-xs">
            <div className="bg-background/50 px-2 py-1 rounded border border-border">
              <span className="text-muted-foreground">HP:</span>
              <span className="ml-1 font-semibold text-foreground">{def.hp}</span>
            </div>
            <div className="bg-background/50 px-2 py-1 rounded border border-border">
              <span className="text-muted-foreground">Armor:</span>
              <span className="ml-1 font-semibold text-foreground">{def.armor}</span>
            </div>
            <div className="bg-background/50 px-2 py-1 rounded border border-border">
              <span className="text-muted-foreground">Speed:</span>
              <span className="ml-1 font-semibold text-foreground">{def.moveSpeed}m/s</span>
            </div>
            <div className="bg-background/50 px-2 py-1 rounded border border-border">
              <span className="text-muted-foreground">Range:</span>
              <span className="ml-1 font-semibold text-foreground">{def.attackRange}m</span>
            </div>
            <div className="bg-background/50 px-2 py-1 rounded border border-border">
              <span className="text-muted-foreground">Damage:</span>
              <span className="ml-1 font-semibold text-foreground">{def.attackDamage}</span>
            </div>
            <div className="bg-background/50 px-2 py-1 rounded border border-border">
              <span className="text-muted-foreground">Attack Rate:</span>
              <span className="ml-1 font-semibold text-foreground">{def.attackRate}/s</span>
            </div>
          </div>
          
          {/* Attack Description */}
          <div className="mb-2">
            <p className="text-xs font-semibold text-foreground mb-1">Normal Attack:</p>
            <p className="text-xs text-muted-foreground">{getAttackDescription(unitType)}</p>
          </div>
          
          {/* Ability Description */}
          <div className="bg-primary/5 border border-primary/20 rounded p-2">
            <p className="text-xs font-semibold text-primary mb-1">
              {def.abilityName} (CD: {def.abilityCooldown}s):
            </p>
            <p className="text-xs text-muted-foreground">{getAbilityDescription(unitType)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to get unit icon emoji/symbol
function getUnitIcon(unitType: UnitType): string {
  const icons: Partial<Record<UnitType, string>> = {
    marine: '🎯',
    warrior: '⚔️',
    snaker: '🐍',
    tank: '🛡️',
    scout: '🗡️',
    artillery: '💥',
    medic: '⚕️',
    interceptor: '✈️',
    berserker: '😤',
    assassin: '🗡️',
    juggernaut: '🏔️',
    striker: '🌪️',
    flare: '☀️',
    nova: '💫',
    eclipse: '🌑',
    corona: '👑',
    supernova: '🌟',
    guardian: '🛡️',
    reaper: '💀',
    oracle: '🔮',
    harbinger: '👻',
    zenith: '☄️',
    pulsar: '⭐',
    celestial: '🌌',
    marksman: '🎯',
    engineer: '🔧',
    skirmisher: '🏃',
    paladin: '⚜️',
    gladiator: '🏛️',
    ravager: '🐺',
    warlord: '👑',
    duelist: '🤺',
    voidwalker: '🌀',
    chronomancer: '⏰',
    nebula: '☁️',
    quasar: '💠',
  };
  
  return icons[unitType] || '⭐';
}

export function UnitInformationScreen({ onBack }: UnitInformationScreenProps) {
  const factions: FactionType[] = ['radiant', 'aurum', 'solari'];
  const playerColor = '#6495ED'; // Default color for display
  
  return (
    <div className="absolute inset-0 overflow-y-auto animate-in fade-in duration-300">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <Card className="w-full max-w-7xl overflow-hidden my-auto">
        <CardHeader className="border-b border-border">
          <div className="flex items-center gap-3">
            <Info size={32} className="text-primary" />
            <div>
              <CardTitle className="text-2xl">Unit Information</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Complete database of all units organized by faction
              </p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <div className="space-y-8">
            {factions.map((faction) => {
              const factionDef = FACTION_DEFINITIONS[faction];
              const units = factionDef.availableUnits;
              
              return (
                <div key={faction}>
                  {/* Faction Header */}
                  <div className="mb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-bold text-primary uppercase tracking-wider orbitron">
                        {factionDef.name}
                      </h2>
                      <span className="text-sm text-muted-foreground">
                        ({units.length} units)
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Base Speed: {factionDef.baseMoveSpeed}m/s</span>
                      <span>•</span>
                      <span>Shape: {factionDef.baseShape}</span>
                      <span>•</span>
                      <span>
                        Ability: {
                          factionDef.ability === 'laser' ? 'Giant Laser' :
                          factionDef.ability === 'shield' ? 'Shield Defense' :
                          'Energy Pulse'
                        }
                      </span>
                    </div>
                  </div>
                  
                  {/* Units Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {units.map((unitType) => (
                      <UnitCard
                        key={unitType}
                        unitType={unitType}
                        playerColor={playerColor}
                      />
                    ))}
                  </div>
                  
                  {/* Divider between factions */}
                  {faction !== 'solari' && (
                    <div className="mt-8 border-t border-border"></div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Information Box */}
          <div className="mt-8 p-4 bg-primary/10 border border-primary/30 rounded">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Note:</strong> All damage values shown are base values. 
              Actual damage may vary based on unit promotion multipliers, armor reduction, and special ability effects. 
              Melee attacks ignore armor completely, while ranged attacks are reduced by the formula: 
              <code className="px-1 py-0.5 bg-background rounded ml-1">reduction = armor / (armor + 100)</code>
            </p>
          </div>
        </CardContent>
        
        <div className="border-t border-border p-4 bg-card">
          <Button
            onClick={onBack}
            className="w-full orbitron uppercase tracking-wider"
            variant="outline"
          >
            <ArrowLeft className="mr-2" size={20} />
            Back to Menu
          </Button>
        </div>
      </Card>
      </div>
    </div>
  );
}
