export const PIXELS_PER_METER = 20;
export const BASE_SIZE_METERS = 3;
export const UNIT_SIZE_METERS = 1;

export const ABILITY_MAX_RANGE = 10;
export const QUEUE_MAX_LENGTH = 20;

export const LASER_RANGE = 20;
export const LASER_WIDTH = 0.5;
export const LASER_DAMAGE_UNIT = 200;
export const LASER_DAMAGE_BASE = 300;
export const LASER_COOLDOWN = 10;

export const PROMOTION_DISTANCE_THRESHOLD = 10;
export const PROMOTION_MULTIPLIER = 1.1;
export const QUEUE_BONUS_PER_NODE = 0.1;

export const COLORS = {
  background: '#0a0a0a',
  pattern: '#1a1a1a',
  playerDefault: 'oklch(0.65 0.25 240)',
  enemyDefault: 'oklch(0.62 0.28 25)',
  photon: 'oklch(0.85 0.20 95)',
  laser: 'oklch(0.70 0.30 320)',
  telegraph: 'oklch(0.75 0.18 200)',
  white: 'oklch(0.98 0 0)',
};

export type Vector2 = { x: number; y: number };

export type CommandNode = 
  | { type: 'move'; position: Vector2 }
  | { type: 'ability'; position: Vector2; direction: Vector2 };

export interface Unit {
  id: string;
  type: UnitType;
  owner: number;
  position: Vector2;
  hp: number;
  maxHp: number;
  commandQueue: CommandNode[];
  damageMultiplier: number;
  distanceTraveled: number;
  distanceCredit: number;
  abilityCooldown: number;
  dashExecuting?: boolean;
  lineJumpTelegraph?: { startTime: number; endPos: Vector2; direction: Vector2 };
  shieldActive?: { endTime: number; radius: number };
  cloaked?: { endTime: number };
  bombardmentActive?: { endTime: number; targetPos: Vector2; impactTime: number };
  healPulseActive?: { endTime: number; radius: number };
  missileBarrageActive?: { endTime: number; missiles: Array<{ position: Vector2; target: Vector2; damage: number }> };
}

export interface Base {
  id: string;
  owner: number;
  position: Vector2;
  hp: number;
  maxHp: number;
  movementTarget: Vector2 | null;
  isSelected: boolean;
  laserCooldown: number;
}

export type UnitType = 'marine' | 'warrior' | 'snaker' | 'tank' | 'scout' | 'artillery' | 'medic' | 'interceptor';

export interface UnitDefinition {
  name: string;
  hp: number;
  moveSpeed: number;
  attackType: 'ranged' | 'melee' | 'none';
  attackRange: number;
  attackDamage: number;
  attackRate: number;
  cost: number;
  abilityName: string;
  abilityCooldown: number;
  canDamageStructures: boolean;
}

export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  marine: {
    name: 'Ranged Marine',
    hp: 40,
    moveSpeed: 4,
    attackType: 'ranged',
    attackRange: 8,
    attackDamage: 6,
    attackRate: 2,
    cost: 25,
    abilityName: 'Burst Fire',
    abilityCooldown: 5,
    canDamageStructures: true,
  },
  warrior: {
    name: 'Melee Warrior',
    hp: 120,
    moveSpeed: 3,
    attackType: 'melee',
    attackRange: 1,
    attackDamage: 18,
    attackRate: 1,
    cost: 40,
    abilityName: 'Execute Dash',
    abilityCooldown: 8,
    canDamageStructures: true,
  },
  snaker: {
    name: 'Snaker',
    hp: 70,
    moveSpeed: 4.5,
    attackType: 'none',
    attackRange: 0,
    attackDamage: 0,
    attackRate: 0,
    cost: 30,
    abilityName: 'Line Jump',
    abilityCooldown: 6,
    canDamageStructures: false,
  },
  tank: {
    name: 'Heavy Tank',
    hp: 200,
    moveSpeed: 2,
    attackType: 'ranged',
    attackRange: 6,
    attackDamage: 12,
    attackRate: 0.8,
    cost: 60,
    abilityName: 'Shield Dome',
    abilityCooldown: 12,
    canDamageStructures: true,
  },
  scout: {
    name: 'Scout',
    hp: 30,
    moveSpeed: 6,
    attackType: 'ranged',
    attackRange: 5,
    attackDamage: 4,
    attackRate: 3,
    cost: 20,
    abilityName: 'Cloak',
    abilityCooldown: 15,
    canDamageStructures: false,
  },
  artillery: {
    name: 'Artillery',
    hp: 50,
    moveSpeed: 2.5,
    attackType: 'ranged',
    attackRange: 15,
    attackDamage: 8,
    attackRate: 0.5,
    cost: 50,
    abilityName: 'Bombardment',
    abilityCooldown: 10,
    canDamageStructures: true,
  },
  medic: {
    name: 'Medic',
    hp: 60,
    moveSpeed: 3.5,
    attackType: 'none',
    attackRange: 0,
    attackDamage: 0,
    attackRate: 0,
    cost: 35,
    abilityName: 'Heal Pulse',
    abilityCooldown: 7,
    canDamageStructures: false,
  },
  interceptor: {
    name: 'Interceptor',
    hp: 55,
    moveSpeed: 5.5,
    attackType: 'ranged',
    attackRange: 10,
    attackDamage: 5,
    attackRate: 2.5,
    cost: 45,
    abilityName: 'Missile Barrage',
    abilityCooldown: 8,
    canDamageStructures: true,
  },
};

export interface GameState {
  mode: 'menu' | 'game' | 'settings' | 'unitSelection' | 'victory' | 'mapSelection' | 'multiplayerLobby' | 'countdown' | 'statistics';
  vsMode: 'ai' | 'player' | 'online' | null;
  
  units: Unit[];
  bases: Base[];
  obstacles: import('./maps').Obstacle[];
  
  players: {
    photons: number;
    incomeRate: number;
    color: string;
  }[];
  
  selectedUnits: Set<string>;
  
  elapsedTime: number;
  lastIncomeTime: number;
  
  winner: number | null;
  
  settings: {
    playerColor: string;
    enemyColor: string;
    enabledUnits: Set<UnitType>;
    unitSlots: Record<'left' | 'up' | 'down', UnitType>;
    selectedMap: string;
    showNumericHP: boolean;
  };

  surrenderClicks: number;
  lastSurrenderClickTime: number;
  surrenderExpanded: boolean;

  countdownStartTime?: number;
  matchStartAnimation?: {
    startTime: number;
    phase: 'bases-sliding' | 'go';
  };

  matchStats?: {
    startTime: number;
    unitsTrainedByPlayer: number;
    unitsKilledByPlayer: number;
    damageDealtByPlayer: number;
    photonsSpentByPlayer: number;
    damageToPlayerBase: number;
    damageToEnemyBase: number;
  };

  matchTimeLimit?: number;
  timeoutWarningShown?: boolean;
}
