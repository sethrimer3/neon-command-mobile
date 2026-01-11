import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft } from '@phosphor-icons/react';
import { UnitType, UNIT_DEFINITIONS, COLORS, FactionType, FACTION_DEFINITIONS, BaseType, BASE_TYPE_DEFINITIONS } from '../lib/types';
import { useState } from 'react';

interface UnitSelectionScreenProps {
  unitSlots: Record<'left' | 'up' | 'down' | 'right', UnitType>;
  onSlotChange: (slot: 'left' | 'up' | 'down' | 'right', unitType: UnitType) => void;
  onBack: () => void;
  playerColor: string;
  playerFaction: FactionType;
  onFactionChange: (faction: FactionType) => void;
  playerBaseType: BaseType;
  onBaseTypeChange: (baseType: BaseType) => void;
}

// Map unit types to their Radiant faction-specific SVG sprite filenames
// This matches the sprite paths used in the game renderer
const RADIANT_UNIT_SPRITES: Partial<Record<UnitType, string>> = {
  marine: 'Marine.svg',
  warrior: 'Blade.svg',
  tank: 'Tank.svg',
  scout: 'Dagger.svg',
  artillery: 'Artillery.svg',
  medic: 'Medic.svg',
  interceptor: 'Interceptor.svg',
  guardian: 'Guardian.svg',
  marksman: 'Marksman.svg',
  engineer: 'Engineer.svg',
  skirmisher: 'skirmisher.svg',
  paladin: 'palladin.svg', // Note: typo in filename is intentional to match actual file
};

export function UnitSelectionScreen({ unitSlots, onSlotChange, onBack, playerColor, playerFaction, onFactionChange, playerBaseType, onBaseTypeChange }: UnitSelectionScreenProps) {
  // Build faction logo URLs with the configured base path for GitHub Pages compatibility.
  const assetBaseUrl = import.meta.env.BASE_URL;
  const [selectedSlot, setSelectedSlot] = useState<'left' | 'up' | 'down' | 'right' | null>(null);

  // Get the appropriate sprite path for a unit type based on faction
  const getUnitSpritePath = (unitType: UnitType, faction: FactionType): string => {
    // Radiant faction has specific SVG sprites for its units
    if (faction === 'radiant' && RADIANT_UNIT_SPRITES[unitType]) {
      return `${assetBaseUrl}ASSETS/sprites/factions/radiant/units/${RADIANT_UNIT_SPRITES[unitType]}`;
    }

    // Fallback to generic sprite path for other factions
    return `${assetBaseUrl}ASSETS/sprites/units/${unitType}.svg`;
  };

  const renderUnitIcon = (unitType: UnitType, size: number = 20) => {
    return (
      <img
        src={getUnitSpritePath(unitType, playerFaction)}
        alt={unitType}
        width={size}
        height={size}
        className="unit-icon"
      />
    );
  };

  const renderBaseIcon = (faction: FactionType, baseType: BaseType, size: number = 60) => {
    const baseShape = FACTION_DEFINITIONS[faction].baseShape;
    const color = playerColor || COLORS.playerDefault;
    
    if (baseShape === 'square') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <rect x="2" y="2" width="16" height="16" fill={color} opacity="0.9" stroke={color} strokeWidth="2" />
        </svg>
      );
    } else if (baseShape === 'circle') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill={color} opacity="0.9" stroke={color} strokeWidth="2" />
        </svg>
      );
    } else if (baseShape === 'triangle') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <polygon points="10,2 18,18 2,18" fill={color} opacity="0.9" stroke={color} strokeWidth="2" />
        </svg>
      );
    } else if (baseShape === 'star') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <polygon points="10,2 12,8 18,9 13,13 15,19 10,16 5,19 7,13 2,9 8,8" fill={color} opacity="0.9" stroke={color} strokeWidth="1" />
        </svg>
      );
    }
    
    return null;
  };

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
      <Card className="w-[600px] max-w-full my-auto">
        <CardHeader>
          <CardTitle className="orbitron text-2xl">Unit Selection</CardTitle>
          <p className="text-sm text-muted-foreground">Select your faction and configure unit slots</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Faction Selection */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Select Faction:</p>
            <div className="grid grid-cols-3 gap-2">
              {(['radiant', 'aurum', 'solari'] as FactionType[]).map((faction) => (
                <button
                  key={faction}
                  onClick={() => {
                    onFactionChange(faction);
                    // Reset unit slots to valid units for this faction
                    const availableUnits = FACTION_DEFINITIONS[faction].availableUnits;
                    if (availableUnits.length > 0) {
                      // For mobile faction with only 1 unit, set all slots to that unit
                      if (availableUnits.length === 1) {
                        onSlotChange('left', availableUnits[0]);
                        onSlotChange('up', availableUnits[0]);
                        onSlotChange('down', availableUnits[0]);
                        onSlotChange('right', availableUnits[0]);
                      } else {
                        // For factions with multiple units, set different units in slots
                        onSlotChange('left', availableUnits[0]);
                        onSlotChange('up', availableUnits[Math.min(1, availableUnits.length - 1)]);
                        onSlotChange('down', availableUnits[Math.min(2, availableUnits.length - 1)]);
                        onSlotChange('right', availableUnits[Math.min(3, availableUnits.length - 1)]);
                      }
                    }
                  }}
                  className={`p-4 border-2 rounded-lg transition-all flex flex-col items-center gap-2 ${
                    playerFaction === faction ? 'ring-4 ring-primary scale-105' : 'hover:scale-105'
                  }`}
                  style={{
                    borderColor: playerColor || COLORS.playerDefault,
                    backgroundColor: playerFaction === faction ? `${playerColor || COLORS.playerDefault}40` : `${playerColor || COLORS.playerDefault}20`,
                  }}
                >
                  <img 
                    src={`${assetBaseUrl}ASSETS/sprites/factions/${faction}/${faction}Logo.png`}
                    alt={`${FACTION_DEFINITIONS[faction].name} logo`}
                    className="w-16 h-16 object-contain"
                  />
                  <div className="text-center">
                    <div className="text-base font-bold orbitron">{FACTION_DEFINITIONS[faction].name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {FACTION_DEFINITIONS[faction].ability === 'laser' ? 'Giant Laser' : FACTION_DEFINITIONS[faction].ability === 'shield' ? 'Shield Defense' : 'Energy Pulse'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {FACTION_DEFINITIONS[faction].availableUnits.length} unit{FACTION_DEFINITIONS[faction].availableUnits.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Base Type Selection */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Select Base Type:</p>
            <div className="grid grid-cols-2 gap-2">
              {FACTION_DEFINITIONS[playerFaction].availableBaseTypes.map((baseType) => {
                const baseTypeDef = BASE_TYPE_DEFINITIONS[baseType];
                return (
                  <button
                    key={baseType}
                    onClick={() => onBaseTypeChange(baseType)}
                    className={`p-3 border-2 rounded-lg transition-all text-left ${
                      playerBaseType === baseType ? 'ring-4 ring-primary scale-105' : 'hover:scale-105'
                    }`}
                    style={{
                      borderColor: playerColor || COLORS.playerDefault,
                      backgroundColor: playerBaseType === baseType ? `${playerColor || COLORS.playerDefault}40` : `${playerColor || COLORS.playerDefault}20`,
                    }}
                  >
                    <div className="text-sm font-bold orbitron">{baseTypeDef.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{baseTypeDef.description}</div>
                    <div className="text-xs mt-1 space-y-0.5">
                      <div>HP: {baseTypeDef.hp} | Armor: {baseTypeDef.armor}</div>
                      <div>{baseTypeDef.canMove ? `Speed: ${baseTypeDef.moveSpeed}` : 'Stationary'}</div>
                      {baseTypeDef.autoAttack && (
                        <div className="text-green-500">Auto-Cannon: {baseTypeDef.autoAttack.damage} dmg @ {baseTypeDef.autoAttack.range}m</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Unit Slot Layout - Base on top with 4 slots in a row below */}
          <div className="space-y-4">
            <p className="text-sm font-medium">Unit Slots (Click to select, then choose unit):</p>
            <div className="flex flex-col items-center gap-4 max-w-[500px] mx-auto">
              {/* Base */}
              <div 
                className="flex flex-col items-center justify-center gap-2 p-4 border-2 rounded-lg"
                style={{
                  borderColor: playerColor || COLORS.playerDefault,
                  backgroundColor: `${playerColor || COLORS.playerDefault}20`,
                  width: '100px',
                  height: '100px',
                }}
              >
                {renderBaseIcon(playerFaction, playerBaseType, 60)}
                <span className="text-xs font-bold capitalize">{playerBaseType}</span>
              </div>

              {/* Unit Slots Row */}
              <div className="flex gap-3 justify-center">
                {/* Slot 1 (Left) */}
                <button
                  onClick={() => setSelectedSlot(selectedSlot === 'left' ? null : 'left')}
                  className={`relative flex flex-col items-center justify-center gap-1 p-3 border-2 rounded-lg transition-all ${
                    selectedSlot === 'left' ? 'ring-4 ring-primary scale-105' : 'hover:scale-105'
                  }`}
                  style={{
                    borderColor: playerColor || COLORS.playerDefault,
                    backgroundColor: selectedSlot === 'left' ? `${playerColor || COLORS.playerDefault}40` : `${playerColor || COLORS.playerDefault}20`,
                    width: '80px',
                    height: '80px',
                  }}
                >
                  {renderUnitIcon(unitSlots.left, 32)}
                  <span className="text-xs capitalize leading-tight">{unitSlots.left}</span>
                  {/* Slot number in bottom right corner */}
                  <span className="absolute bottom-1 right-1 text-xs font-bold opacity-60">1</span>
                </button>

                {/* Slot 2 (Up) */}
                <button
                  onClick={() => setSelectedSlot(selectedSlot === 'up' ? null : 'up')}
                  className={`relative flex flex-col items-center justify-center gap-1 p-3 border-2 rounded-lg transition-all ${
                    selectedSlot === 'up' ? 'ring-4 ring-primary scale-105' : 'hover:scale-105'
                  }`}
                  style={{
                    borderColor: playerColor || COLORS.playerDefault,
                    backgroundColor: selectedSlot === 'up' ? `${playerColor || COLORS.playerDefault}40` : `${playerColor || COLORS.playerDefault}20`,
                    width: '80px',
                    height: '80px',
                  }}
                >
                  {renderUnitIcon(unitSlots.up, 32)}
                  <span className="text-xs capitalize leading-tight">{unitSlots.up}</span>
                  {/* Slot number in bottom right corner */}
                  <span className="absolute bottom-1 right-1 text-xs font-bold opacity-60">2</span>
                </button>

                {/* Slot 3 (Down) */}
                <button
                  onClick={() => setSelectedSlot(selectedSlot === 'down' ? null : 'down')}
                  className={`relative flex flex-col items-center justify-center gap-1 p-3 border-2 rounded-lg transition-all ${
                    selectedSlot === 'down' ? 'ring-4 ring-primary scale-105' : 'hover:scale-105'
                  }`}
                  style={{
                    borderColor: playerColor || COLORS.playerDefault,
                    backgroundColor: selectedSlot === 'down' ? `${playerColor || COLORS.playerDefault}40` : `${playerColor || COLORS.playerDefault}20`,
                    width: '80px',
                    height: '80px',
                  }}
                >
                  {renderUnitIcon(unitSlots.down, 32)}
                  <span className="text-xs capitalize leading-tight">{unitSlots.down}</span>
                  {/* Slot number in bottom right corner */}
                  <span className="absolute bottom-1 right-1 text-xs font-bold opacity-60">3</span>
                </button>

                {/* Slot 4 (Right) */}
                <button
                  onClick={() => setSelectedSlot(selectedSlot === 'right' ? null : 'right')}
                  className={`relative flex flex-col items-center justify-center gap-1 p-3 border-2 rounded-lg transition-all ${
                    selectedSlot === 'right' ? 'ring-4 ring-primary scale-105' : 'hover:scale-105'
                  }`}
                  style={{
                    borderColor: playerColor || COLORS.playerDefault,
                    backgroundColor: selectedSlot === 'right' ? `${playerColor || COLORS.playerDefault}40` : `${playerColor || COLORS.playerDefault}20`,
                    width: '80px',
                    height: '80px',
                  }}
                >
                  {renderUnitIcon(unitSlots.right, 32)}
                  <span className="text-xs capitalize leading-tight">{unitSlots.right}</span>
                  {/* Slot number in bottom right corner */}
                  <span className="absolute bottom-1 right-1 text-xs font-bold opacity-60">4</span>
                </button>
              </div>
            </div>
          </div>

          {/* Available Units */}
          {selectedSlot && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Available Units (Click to assign to {selectedSlot} slot):</p>
              <div className="grid grid-cols-4 gap-2 justify-center max-w-md mx-auto">
                {FACTION_DEFINITIONS[playerFaction].availableUnits.map((unitType) => {
                  return (
                    <button
                      key={unitType}
                      onClick={() => {
                        onSlotChange(selectedSlot, unitType);
                        setSelectedSlot(null);
                      }}
                      className="w-20 h-20 border-2 rounded-lg flex flex-col items-center justify-center gap-1 hover:scale-105 transition-all"
                      style={{
                        borderColor: playerColor || COLORS.playerDefault,
                        backgroundColor: `${playerColor || COLORS.playerDefault}20`,
                      }}
                    >
                      <div className="flex items-center justify-center h-8">
                        {renderUnitIcon(unitType, 24)}
                      </div>
                      <span className="text-xs capitalize leading-tight">{unitType}</span>
                      <span className="text-xs text-muted-foreground">{UNIT_DEFINITIONS[unitType].cost}◈</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Button
            onClick={onBack}
            className="w-full orbitron"
            variant="outline"
          >
            <ArrowLeft className="mr-2" size={20} />
            Back to Menu
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
