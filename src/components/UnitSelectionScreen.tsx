import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft } from '@phosphor-icons/react';
import { UnitType, UNIT_DEFINITIONS, COLORS, FactionType, FACTION_DEFINITIONS } from '../lib/types';

interface UnitSelectionScreenProps {
  unitSlots: Record<'left' | 'up' | 'down' | 'right', UnitType>;
  onSlotChange: (slot: 'left' | 'up' | 'down' | 'right', unitType: UnitType) => void;
  onBack: () => void;
  playerColor: string;
  playerFaction: FactionType;
  onFactionChange: (faction: FactionType) => void;
}

export function UnitSelectionScreen({ unitSlots, onSlotChange, onBack, playerColor, playerFaction, onFactionChange }: UnitSelectionScreenProps) {
  const [selectedUnit, setSelectedUnit] = useState<UnitType | null>(null);
  // Build faction logo URLs with the configured base path for GitHub Pages compatibility.
  const assetBaseUrl = import.meta.env.BASE_URL;

  const handleUnitClick = (unitType: UnitType) => {
    setSelectedUnit(unitType);
  };

  const handleSlotClick = (slot: 'left' | 'up' | 'down' | 'right') => {
    if (selectedUnit) {
      // Find if this unit is currently in another slot
      const currentSlotEntry = Object.entries(unitSlots).find(([key, value]) => value === selectedUnit);
      
      if (currentSlotEntry && currentSlotEntry[0] !== slot) {
        // Unit is being moved from another slot - swap the units
        const fromSlot = currentSlotEntry[0] as 'left' | 'up' | 'down' | 'right';
        const unitInTargetSlot = unitSlots[slot];
        
        // Swap: put selected unit in target slot, and put target slot's unit in the from slot
        onSlotChange(slot, selectedUnit);
        onSlotChange(fromSlot, unitInTargetSlot);
      } else {
        // Unit is not currently in any slot, or clicking the same slot - just assign it
        onSlotChange(slot, selectedUnit);
      }
      
      setSelectedUnit(null);
    }
  };

  // Check if a unit is assigned to any slot
  const isUnitAssigned = (unitType: UnitType): boolean => {
    return Object.values(unitSlots).includes(unitType);
  };

  const renderUnitIcon = (unitType: UnitType, size: number = 20) => {
    const color = playerColor || COLORS.playerDefault;
    
    if (unitType === 'marine') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill={color} opacity="0.8" />
        </svg>
      );
    } else if (unitType === 'warrior') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill={color} opacity="0.8" />
          <line x1="4" y1="4" x2="16" y2="16" stroke={color} strokeWidth="2" />
          <line x1="16" y1="4" x2="4" y2="16" stroke={color} strokeWidth="2" />
        </svg>
      );
    } else if (unitType === 'snaker') {
      return (
        <svg width={size * 2} height={size} viewBox="0 0 40 20">
          {[0, 1, 2, 3, 4].map((i) => (
            <polygon
              key={i}
              points={`${i * 8},10 ${i * 8 + 4},5 ${i * 8 + 4},15`}
              fill={color}
              opacity="0.8"
            />
          ))}
        </svg>
      );
    } else if (unitType === 'tank') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <rect x="2" y="2" width="16" height="16" fill={color} opacity="0.8" stroke={color} strokeWidth="2" />
        </svg>
      );
    } else if (unitType === 'scout') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <polygon points="10,2 17,17 10,14 3,17" fill={color} opacity="0.8" />
        </svg>
      );
    } else if (unitType === 'artillery') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <rect x="3" y="8" width="14" height="6" fill={color} opacity="0.8" />
          <line x1="10" y1="11" x2="17" y2="3" stroke={color} strokeWidth="2" />
        </svg>
      );
    } else if (unitType === 'medic') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill={color} opacity="0.8" />
          <rect x="7" y="4" width="6" height="12" fill="white" />
          <rect x="4" y="7" width="12" height="6" fill="white" />
        </svg>
      );
    } else if (unitType === 'interceptor') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <polygon points="10,2 15,10 10,16 5,10" fill={color} opacity="0.8" />
        </svg>
      );
    } else if (unitType === 'berserker') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill={color} opacity="0.8" />
          <polygon points="10,4 13,10 10,8 7,10" fill="white" opacity="0.9" />
          <rect x="6" y="11" width="8" height="4" fill="white" opacity="0.9" />
        </svg>
      );
    } else if (unitType === 'assassin') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill={color} opacity="0.8" />
          <polygon points="10,3 14,10 10,9 6,10" fill="white" opacity="0.9" />
          <line x1="7" y1="13" x2="13" y2="13" stroke="white" strokeWidth="2" opacity="0.9" />
        </svg>
      );
    } else if (unitType === 'juggernaut') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="9" fill={color} opacity="0.9" stroke={color} strokeWidth="2" />
          <rect x="6" y="6" width="8" height="8" fill="white" opacity="0.9" />
          <circle cx="10" cy="10" r="2" fill={color} />
        </svg>
      );
    } else if (unitType === 'striker') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill={color} opacity="0.8" />
          <polygon points="10,4 11,9 9,9" fill="white" opacity="0.9" />
          <polygon points="10,16 9,11 11,11" fill="white" opacity="0.9" />
          <polygon points="4,10 9,11 9,9" fill="white" opacity="0.9" />
          <polygon points="16,10 11,9 11,11" fill="white" opacity="0.9" />
        </svg>
      );
    } else if (unitType === 'flare') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="7" fill={color} opacity="0.8" />
          <polygon points="10,3 11,9 10,10 9,9" fill="white" opacity="0.9" />
          <polygon points="17,10 11,11 10,10 11,9" fill="white" opacity="0.9" />
          <polygon points="10,17 9,11 10,10 11,11" fill="white" opacity="0.9" />
          <polygon points="3,10 9,9 10,10 9,11" fill="white" opacity="0.9" />
        </svg>
      );
    } else if (unitType === 'nova') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill={color} opacity="0.9" />
          <circle cx="10" cy="10" r="4" fill="white" opacity="0.9" />
          <circle cx="10" cy="10" r="6" fill="none" stroke="white" strokeWidth="1" opacity="0.5" />
        </svg>
      );
    } else if (unitType === 'eclipse') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="7" fill={color} opacity="0.8" />
          <circle cx="12" cy="8" r="6" fill="black" opacity="0.6" />
          <circle cx="8" cy="12" r="3" fill="white" opacity="0.4" />
        </svg>
      );
    } else if (unitType === 'corona') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill={color} opacity="0.9" stroke={color} strokeWidth="2" />
          <circle cx="10" cy="10" r="5" fill="white" opacity="0.8" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            const x1 = 10 + Math.cos(rad) * 6;
            const y1 = 10 + Math.sin(rad) * 6;
            const x2 = 10 + Math.cos(rad) * 9;
            const y2 = 10 + Math.sin(rad) * 9;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="1.5" opacity="0.7" />;
          })}
        </svg>
      );
    } else if (unitType === 'supernova') {
      return (
        <svg width={size} height={size} viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="9" fill={color} opacity="0.9" />
          <polygon points="10,2 11,9 13,7 12,10 18,10 11,11 13,13 10,12 10,18 9,11 7,13 8,10 2,10 9,9 7,7 10,8" fill="white" opacity="0.9" />
        </svg>
      );
    }
    
    return null;
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 overflow-auto">
      <Card className="w-[500px] max-w-full">
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

          {/* Lock the base layout to a predictable square so slot buttons anchor correctly. */}
          <div className="relative w-full max-w-[400px] mx-auto" style={{ aspectRatio: '1 / 1' }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="w-32 h-32 border-4 relative transition-all p-2"
                style={{
                  borderColor: playerColor || COLORS.playerDefault,
                  backgroundColor: `${playerColor || COLORS.playerDefault}20`,
                  borderRadius: FACTION_DEFINITIONS[playerFaction].baseShape === 'circle' ? '50%' : '0',
                  clipPath: FACTION_DEFINITIONS[playerFaction].baseShape === 'star' 
                    ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' 
                    : undefined,
                }}
              >
                <img 
                  src={`${assetBaseUrl}ASSETS/sprites/factions/${playerFaction}/${playerFaction}Logo.png`}
                  alt={`${FACTION_DEFINITIONS[playerFaction].name} base`}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            <button
              onClick={() => handleSlotClick('up')}
              className={`absolute left-1/2 top-[10%] -translate-x-1/2 w-20 h-20 border-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-all hover:scale-105`}
              style={{
                borderColor: playerColor || COLORS.playerDefault,
                backgroundColor: `${playerColor || COLORS.playerDefault}20`,
              }}
            >
              {renderUnitIcon(unitSlots.up, 32)}
              <span className="text-xs capitalize">{unitSlots.up}</span>
              <span className="text-xs text-muted-foreground">{UNIT_DEFINITIONS[unitSlots.up].cost}◈</span>
            </button>

            <button
              onClick={() => handleSlotClick('left')}
              className={`absolute left-[10%] top-1/2 -translate-y-1/2 w-20 h-20 border-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-all hover:scale-105`}
              style={{
                borderColor: playerColor || COLORS.playerDefault,
                backgroundColor: `${playerColor || COLORS.playerDefault}20`,
              }}
            >
              {renderUnitIcon(unitSlots.left, 32)}
              <span className="text-xs capitalize">{unitSlots.left}</span>
              <span className="text-xs text-muted-foreground">{UNIT_DEFINITIONS[unitSlots.left].cost}◈</span>
            </button>

            <button
              onClick={() => handleSlotClick('down')}
              className={`absolute left-1/2 bottom-[10%] -translate-x-1/2 w-20 h-20 border-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-all hover:scale-105`}
              style={{
                borderColor: playerColor || COLORS.playerDefault,
                backgroundColor: `${playerColor || COLORS.playerDefault}20`,
              }}
            >
              {renderUnitIcon(unitSlots.down, 32)}
              <span className="text-xs capitalize">{unitSlots.down}</span>
              <span className="text-xs text-muted-foreground">{UNIT_DEFINITIONS[unitSlots.down].cost}◈</span>
            </button>

            <button
              onClick={() => handleSlotClick('right')}
              className={`absolute right-[10%] top-1/2 -translate-y-1/2 w-20 h-20 border-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-all hover:scale-105`}
              style={{
                borderColor: playerColor || COLORS.playerDefault,
                backgroundColor: `${playerColor || COLORS.playerDefault}20`,
              }}
            >
              {renderUnitIcon(unitSlots.right, 32)}
              <span className="text-xs capitalize">{unitSlots.right}</span>
              <span className="text-xs text-muted-foreground">{UNIT_DEFINITIONS[unitSlots.right].cost}◈</span>
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-center orbitron">
              {selectedUnit ? `Selected: ${selectedUnit} - Click a slot to assign` : 'Click a unit to select it'}
            </p>
            <div className="grid grid-cols-4 gap-2 justify-center max-w-md mx-auto">
              {FACTION_DEFINITIONS[playerFaction].availableUnits.map((unitType) => {
                const isAssigned = isUnitAssigned(unitType);
                const isSelected = selectedUnit === unitType;
                return (
                  <button
                    key={unitType}
                    onClick={() => handleUnitClick(unitType)}
                    className={`w-20 h-20 border-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-all relative ${
                      isSelected ? 'ring-4 ring-primary scale-105' : 'hover:scale-105'
                    }`}
                    style={{
                      borderColor: playerColor || COLORS.playerDefault,
                      backgroundColor: isSelected 
                        ? `${playerColor || COLORS.playerDefault}40` 
                        : `${playerColor || COLORS.playerDefault}20`,
                    }}
                  >
                    {isAssigned && (
                      <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
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
  );
}
