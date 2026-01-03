export const PIXELS_PER_METER = 20;
export const BASE_SIZE_METERS = 3;
export const UNIT_SIZE_METERS = 1;

// Fixed arena dimensions in meters for consistent gameplay across all devices
export const ARENA_WIDTH_METERS = 60;  // Fixed logical width in meters
export const ARENA_HEIGHT_METERS = 90; // Fixed logical height in meters

export const ABILITY_MAX_RANGE = 10;
export const QUEUE_MAX_LENGTH = 3;

export const LASER_RANGE = 20;
export const LASER_WIDTH = 0.5;
export const LASER_DAMAGE_UNIT = 200;
export const LASER_DAMAGE_BASE = 300;
export const LASER_COOLDOWN = 10;

// Unit ability laser constants
export const ABILITY_LASER_DAMAGE = 10;
export const ABILITY_LASER_WIDTH = 0.5;
export const ABILITY_LASER_DURATION = 1000; // milliseconds
export const ABILITY_LASER_BASE_DAMAGE_MULTIPLIER = 0.5;

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

// Unit modifiers that affect how units interact with each other
export type UnitModifier = 'ranged' | 'melee' | 'flying' | 'small' | 'healing';

// Particle physics for visual effects
export interface Particle {
  id: string;
  position: Vector2;
  velocity: Vector2;
  color: string;
  trail: Vector2[]; // Trail positions for rendering
  angle: number; // Orbital angle for swirling motion
}

// Projectile for ranged attacks
export interface Projectile {
  id: string;
  position: Vector2;
  velocity: Vector2;
  target: Vector2;
  damage: number;
  owner: number;
  color: string;
  lifetime: number; // seconds
  createdAt: number; // timestamp
  sourceUnit: string; // unit id that created it
  targetUnit?: string; // optional specific target unit id
}

export type CommandNode = 
  | { type: 'move'; position: Vector2 }
  | { type: 'ability'; position: Vector2; direction: Vector2 }
  | { type: 'attack-move'; position: Vector2 }
  | { type: 'patrol'; position: Vector2; returnPosition: Vector2 };

export interface Unit {
  id: string;
  type: UnitType;
  owner: number;
  position: Vector2;
  hp: number;
  maxHp: number;
  armor: number; // Reduces damage from ranged attacks
  displayHp?: number; // Smoothly interpolated health for display
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
  laserBeam?: { endTime: number; direction: Vector2; range: number }; // Unit laser ability effect
  particles?: Particle[]; // Particles attracted to the unit
  meleeAttackEffect?: { endTime: number; targetPos: Vector2 }; // Visual effect for melee attacks
  attackCooldown?: number; // Time until next attack
  selectionRing?: { startTime: number }; // Selection ring animation
  rotation?: number; // Current rotation angle in radians (0 = facing right)
  targetRotation?: number; // Target rotation angle for smooth interpolation
  velocity?: Vector2; // Current velocity for smooth acceleration/deceleration
  currentSpeed?: number; // Current movement speed for acceleration/deceleration
  stuckTimer?: number; // Time in seconds that unit has been stuck (unable to move with commands queued)
  lastPosition?: Vector2; // Last recorded position for stuck detection
  queueFadeStartTime?: number; // Timestamp when queue fade animation started (for cancelled commands)
  queueDrawStartTime?: number; // Timestamp when queue drawing animation started (for new commands)
  queueDrawReverse?: boolean; // Whether queue should un-draw in reverse (true when unit dies)
  temporaryAvoidance?: { originalPosition: Vector2; returnDelay: number }; // For friendly unit avoidance - returnDelay is time remaining in seconds
}

export type FactionType = 'radiant' | 'aurum' | 'solari';

export type BaseType = 'standard' | 'defense' | 'assault' | 'support';

export interface BaseTypeDefinition {
  name: string;
  description: string;
  hp: number;
  armor: number;
  moveSpeed: number; // 0 for stationary
  ability: 'laser' | 'shield' | 'pulse' | 'auto-cannon' | 'regeneration';
  canMove: boolean;
  autoAttack?: {
    range: number;
    damage: number;
    attackRate: number; // attacks per second
  };
}

export const BASE_TYPE_DEFINITIONS: Record<BaseType, BaseTypeDefinition> = {
  standard: {
    name: 'Standard Base',
    description: 'Mobile base with faction ability',
    hp: 1000,
    armor: 15,
    moveSpeed: 0, // Will use faction baseMoveSpeed
    ability: 'laser', // Will use faction ability
    canMove: true,
  },
  defense: {
    name: 'Defense Fortress',
    description: 'Stationary base with auto-targeting cannon',
    hp: 1500,
    armor: 25,
    moveSpeed: 0,
    ability: 'auto-cannon',
    canMove: false,
    autoAttack: {
      range: 15,
      damage: 6, // Similar to marine damage
      attackRate: 2, // 2 attacks per second
    },
  },
  assault: {
    name: 'Assault Base',
    description: 'Fast mobile base with enhanced shield',
    hp: 800,
    armor: 10,
    moveSpeed: 4.5, // Faster than standard
    ability: 'shield',
    canMove: true,
  },
  support: {
    name: 'Support Nexus',
    description: 'Slow base with regeneration aura',
    hp: 1200,
    armor: 20,
    moveSpeed: 1.0,
    ability: 'regeneration',
    canMove: true,
  },
};

export interface FactionDefinition {
  name: string;
  baseMoveSpeed: number;
  baseShape: 'square' | 'circle' | 'star' | 'triangle';
  ability: 'laser' | 'shield' | 'pulse';
  availableUnits: UnitType[];
  availableBaseTypes: BaseType[];
}

export const FACTION_DEFINITIONS: Record<FactionType, FactionDefinition> = {
  radiant: {
    name: 'Radiant',
    baseMoveSpeed: 1.5,
    baseShape: 'square',
    ability: 'laser',
    availableUnits: ['marine', 'warrior', 'tank', 'scout', 'artillery', 'medic', 'interceptor', 'guardian', 'marksman', 'engineer', 'skirmisher', 'paladin'],
    availableBaseTypes: ['standard', 'defense'],
  },
  aurum: {
    name: 'Aurum',
    baseMoveSpeed: 3.0,
    baseShape: 'triangle',
    ability: 'shield',
    availableUnits: ['snaker', 'berserker', 'assassin', 'juggernaut', 'striker', 'reaper', 'oracle', 'harbinger', 'gladiator', 'ravager', 'warlord', 'duelist'],
    availableBaseTypes: ['standard', 'assault'],
  },
  solari: {
    name: 'Solari',
    baseMoveSpeed: 2.0,
    baseShape: 'circle',
    ability: 'pulse',
    availableUnits: ['flare', 'nova', 'eclipse', 'corona', 'supernova', 'zenith', 'pulsar', 'celestial', 'voidwalker', 'chronomancer', 'nebula', 'quasar'],
    availableBaseTypes: ['standard', 'support'],
  },
};

export interface Base {
  id: string;
  owner: number;
  position: Vector2;
  hp: number;
  maxHp: number;
  armor: number; // Reduces damage from ranged attacks
  movementTarget: Vector2 | null;
  isSelected: boolean;
  laserCooldown: number;
  laserBeam?: { endTime: number; direction: Vector2 }; // Visual effect for laser
  faction: FactionType;
  baseType: BaseType;
  shieldActive?: { endTime: number }; // Shield ability for aurum faction
  autoAttackCooldown?: number; // Cooldown for auto-attack (defense base)
  regenerationPulse?: { endTime: number; radius: number }; // Visual effect for regeneration pulse
}

export type UnitType = 'marine' | 'warrior' | 'snaker' | 'tank' | 'scout' | 'artillery' | 'medic' | 'interceptor' | 'berserker' | 'assassin' | 'juggernaut' | 'striker' | 'flare' | 'nova' | 'eclipse' | 'corona' | 'supernova' | 'guardian' | 'reaper' | 'oracle' | 'harbinger' | 'zenith' | 'pulsar' | 'celestial' | 'marksman' | 'engineer' | 'skirmisher' | 'paladin' | 'gladiator' | 'ravager' | 'warlord' | 'duelist' | 'voidwalker' | 'chronomancer' | 'nebula' | 'quasar';

export interface UnitDefinition {
  name: string;
  hp: number;
  armor: number; // Reduces damage from ranged attacks
  moveSpeed: number;
  attackType: 'ranged' | 'melee' | 'none';
  attackRange: number;
  attackDamage: number;
  attackRate: number;
  cost: number;
  abilityName: string;
  abilityCooldown: number;
  canDamageStructures: boolean;
  modifiers: UnitModifier[]; // Unit modifiers (ranged, melee, flying, small, healing)
}

export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  marine: {
    name: 'Ranged Marine',
    hp: 40,
    armor: 2,
    moveSpeed: 4,
    attackType: 'ranged',
    attackRange: 8,
    attackDamage: 6,
    attackRate: 2,
    cost: 25,
    abilityName: 'Burst Fire',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['ranged'],
  },
  warrior: {
    name: 'Melee Warrior',
    hp: 120,
    armor: 5,
    moveSpeed: 3,
    attackType: 'melee',
    attackRange: 1,
    attackDamage: 18,
    attackRate: 1,
    cost: 40,
    abilityName: 'Execute Dash',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['melee'],
  },
  snaker: {
    name: 'Snaker',
    hp: 70,
    armor: 1,
    moveSpeed: 4.5,
    attackType: 'none',
    attackRange: 0,
    attackDamage: 0,
    attackRate: 0,
    cost: 30,
    abilityName: 'Line Jump',
    abilityCooldown: 5,
    canDamageStructures: false,
    modifiers: ['small'],
  },
  tank: {
    name: 'Heavy Tank',
    hp: 200,
    armor: 8,
    moveSpeed: 2,
    attackType: 'ranged',
    attackRange: 6,
    attackDamage: 12,
    attackRate: 0.8,
    cost: 60,
    abilityName: 'Shield Dome',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['ranged'],
  },
  scout: {
    name: 'Scout',
    hp: 30,
    armor: 1,
    moveSpeed: 6,
    attackType: 'ranged',
    attackRange: 5,
    attackDamage: 4,
    attackRate: 3,
    cost: 20,
    abilityName: 'Cloak',
    abilityCooldown: 5,
    canDamageStructures: false,
    modifiers: ['ranged', 'small'],
  },
  artillery: {
    name: 'Artillery',
    hp: 50,
    armor: 2,
    moveSpeed: 2.5,
    attackType: 'ranged',
    attackRange: 15,
    attackDamage: 8,
    attackRate: 0.5,
    cost: 50,
    abilityName: 'Bombardment',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['ranged'],
  },
  medic: {
    name: 'Medic',
    hp: 60,
    armor: 2,
    moveSpeed: 3.5,
    attackType: 'none',
    attackRange: 0,
    attackDamage: 0,
    attackRate: 0,
    cost: 35,
    abilityName: 'Heal Pulse',
    abilityCooldown: 5,
    canDamageStructures: false,
    modifiers: ['healing'],
  },
  interceptor: {
    name: 'Interceptor',
    hp: 55,
    armor: 1,
    moveSpeed: 5.5,
    attackType: 'ranged',
    attackRange: 10,
    attackDamage: 5,
    attackRate: 2.5,
    cost: 45,
    abilityName: 'Missile Barrage',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['ranged', 'flying'],
  },
  berserker: {
    name: 'Berserker',
    hp: 150,
    armor: 4,
    moveSpeed: 3.5,
    attackType: 'melee',
    attackRange: 1.2,
    attackDamage: 25,
    attackRate: 0.8,
    cost: 50,
    abilityName: 'Rage',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['melee'],
  },
  assassin: {
    name: 'Assassin',
    hp: 80,
    armor: 2,
    moveSpeed: 5,
    attackType: 'melee',
    attackRange: 1,
    attackDamage: 15,
    attackRate: 2,
    cost: 35,
    abilityName: 'Shadow Strike',
    abilityCooldown: 5,
    canDamageStructures: false,
    modifiers: ['melee'],
  },
  juggernaut: {
    name: 'Juggernaut',
    hp: 250,
    armor: 10,
    moveSpeed: 2,
    attackType: 'melee',
    attackRange: 1.5,
    attackDamage: 30,
    attackRate: 0.6,
    cost: 70,
    abilityName: 'Ground Slam',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['melee'],
  },
  striker: {
    name: 'Striker',
    hp: 100,
    armor: 3,
    moveSpeed: 4,
    attackType: 'melee',
    attackRange: 1,
    attackDamage: 20,
    attackRate: 1.2,
    cost: 45,
    abilityName: 'Whirlwind',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['melee'],
  },
  flare: {
    name: 'Flare',
    hp: 50,
    armor: 1,
    moveSpeed: 5,
    attackType: 'ranged',
    attackRange: 7,
    attackDamage: 7,
    attackRate: 2.5,
    cost: 30,
    abilityName: 'Solar Beam',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['ranged', 'small'],
  },
  nova: {
    name: 'Nova',
    hp: 110,
    armor: 4,
    moveSpeed: 3.5,
    attackType: 'melee',
    attackRange: 1.2,
    attackDamage: 22,
    attackRate: 1,
    cost: 45,
    abilityName: 'Stellar Burst',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['melee'],
  },
  eclipse: {
    name: 'Eclipse',
    hp: 80,
    armor: 2,
    moveSpeed: 4.5,
    attackType: 'ranged',
    attackRange: 9,
    attackDamage: 5,
    attackRate: 3,
    cost: 35,
    abilityName: 'Shadow Veil',
    abilityCooldown: 5,
    canDamageStructures: false,
    modifiers: ['ranged'],
  },
  corona: {
    name: 'Corona',
    hp: 180,
    armor: 6,
    moveSpeed: 2.5,
    attackType: 'ranged',
    attackRange: 6,
    attackDamage: 10,
    attackRate: 1,
    cost: 55,
    abilityName: 'Radiation Wave',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['ranged'],
  },
  supernova: {
    name: 'Supernova',
    hp: 60,
    armor: 2,
    moveSpeed: 3,
    attackType: 'ranged',
    attackRange: 12,
    attackDamage: 15,
    attackRate: 0.7,
    cost: 65,
    abilityName: 'Cosmic Explosion',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['ranged'],
  },
  guardian: {
    name: 'Guardian',
    hp: 160,
    armor: 7,
    moveSpeed: 2.5,
    attackType: 'melee',
    attackRange: 1.3,
    attackDamage: 16,
    attackRate: 1,
    cost: 55,
    abilityName: 'Protect Allies',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['melee'],
  },
  reaper: {
    name: 'Reaper',
    hp: 65,
    armor: 2,
    moveSpeed: 4.5,
    attackType: 'ranged',
    attackRange: 9,
    attackDamage: 8,
    attackRate: 2,
    cost: 40,
    abilityName: 'Soul Strike',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['ranged'],
  },
  oracle: {
    name: 'Oracle',
    hp: 70,
    armor: 2,
    moveSpeed: 3,
    attackType: 'none',
    attackRange: 0,
    attackDamage: 0,
    attackRate: 0,
    cost: 40,
    abilityName: 'Divine Restoration',
    abilityCooldown: 5,
    canDamageStructures: false,
    modifiers: ['healing'],
  },
  harbinger: {
    name: 'Harbinger',
    hp: 75,
    armor: 2,
    moveSpeed: 5,
    attackType: 'ranged',
    attackRange: 8,
    attackDamage: 6,
    attackRate: 2.5,
    cost: 50,
    abilityName: 'Ethereal Strike',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['ranged', 'flying'],
  },
  zenith: {
    name: 'Zenith',
    hp: 65,
    armor: 2,
    moveSpeed: 3.5,
    attackType: 'none',
    attackRange: 0,
    attackDamage: 0,
    attackRate: 0,
    cost: 40,
    abilityName: 'Solar Blessing',
    abilityCooldown: 5,
    canDamageStructures: false,
    modifiers: ['healing'],
  },
  pulsar: {
    name: 'Pulsar',
    hp: 70,
    armor: 2,
    moveSpeed: 5.5,
    attackType: 'ranged',
    attackRange: 7,
    attackDamage: 7,
    attackRate: 2.5,
    cost: 48,
    abilityName: 'Stellar Dive',
    abilityCooldown: 5,
    canDamageStructures: false,
    modifiers: ['ranged', 'flying', 'small'],
  },
  celestial: {
    name: 'Celestial',
    hp: 130,
    armor: 5,
    moveSpeed: 3,
    attackType: 'melee',
    attackRange: 1.2,
    attackDamage: 20,
    attackRate: 1.1,
    cost: 50,
    abilityName: 'Astral Charge',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['melee'],
  },
  // Radiant faction - 4 new units (balanced/ranged focus)
  marksman: {
    name: 'Marksman',
    hp: 45,
    armor: 1,
    moveSpeed: 3,
    attackType: 'ranged',
    attackRange: 18,
    attackDamage: 12,
    attackRate: 0.6,
    cost: 55,
    abilityName: 'Precision Shot',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['ranged'],
  },
  engineer: {
    name: 'Engineer',
    hp: 70,
    armor: 3,
    moveSpeed: 3,
    attackType: 'ranged',
    attackRange: 6,
    attackDamage: 5,
    attackRate: 1.5,
    cost: 45,
    abilityName: 'Deploy Turret',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['ranged'],
  },
  skirmisher: {
    name: 'Skirmisher',
    hp: 55,
    armor: 2,
    moveSpeed: 5,
    attackType: 'ranged',
    attackRange: 7,
    attackDamage: 6,
    attackRate: 2,
    cost: 35,
    abilityName: 'Rapid Retreat',
    abilityCooldown: 5,
    canDamageStructures: false,
    modifiers: ['ranged', 'small'],
  },
  paladin: {
    name: 'Paladin',
    hp: 140,
    armor: 6,
    moveSpeed: 3,
    attackType: 'ranged',
    attackRange: 5,
    attackDamage: 10,
    attackRate: 1,
    cost: 60,
    abilityName: 'Holy Strike',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['ranged', 'melee'],
  },
  // Aurum faction - 4 new units (melee focus)
  gladiator: {
    name: 'Gladiator',
    hp: 130,
    armor: 5,
    moveSpeed: 3.5,
    attackType: 'melee',
    attackRange: 1.2,
    attackDamage: 28,
    attackRate: 0.9,
    cost: 55,
    abilityName: 'Lethal Strike',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['melee'],
  },
  ravager: {
    name: 'Ravager',
    hp: 100,
    armor: 3,
    moveSpeed: 4.5,
    attackType: 'melee',
    attackRange: 1,
    attackDamage: 18,
    attackRate: 1.5,
    cost: 45,
    abilityName: 'Blood Hunt',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['melee'],
  },
  warlord: {
    name: 'Warlord',
    hp: 280,
    armor: 12,
    moveSpeed: 2,
    attackType: 'melee',
    attackRange: 1.5,
    attackDamage: 35,
    attackRate: 0.5,
    cost: 80,
    abilityName: 'Battle Cry',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['melee'],
  },
  duelist: {
    name: 'Duelist',
    hp: 90,
    armor: 4,
    moveSpeed: 4,
    attackType: 'melee',
    attackRange: 1.2,
    attackDamage: 16,
    attackRate: 1.8,
    cost: 40,
    abilityName: 'Riposte',
    abilityCooldown: 5,
    canDamageStructures: false,
    modifiers: ['melee'],
  },
  // Solari faction - 4 new units (complex/unique abilities)
  voidwalker: {
    name: 'Voidwalker',
    hp: 75,
    armor: 2,
    moveSpeed: 3.5,
    attackType: 'ranged',
    attackRange: 7,
    attackDamage: 8,
    attackRate: 2,
    cost: 50,
    abilityName: 'Void Step',
    abilityCooldown: 5,
    canDamageStructures: false,
    modifiers: ['ranged'],
  },
  chronomancer: {
    name: 'Chronomancer',
    hp: 60,
    armor: 2,
    moveSpeed: 3,
    attackType: 'ranged',
    attackRange: 8,
    attackDamage: 6,
    attackRate: 1.5,
    cost: 55,
    abilityName: 'Time Dilation',
    abilityCooldown: 5,
    canDamageStructures: false,
    modifiers: ['ranged'],
  },
  nebula: {
    name: 'Nebula',
    hp: 80,
    armor: 3,
    moveSpeed: 2.5,
    attackType: 'ranged',
    attackRange: 6,
    attackDamage: 7,
    attackRate: 1.2,
    cost: 50,
    abilityName: 'Cosmic Barrier',
    abilityCooldown: 5,
    canDamageStructures: false,
    modifiers: ['ranged'],
  },
  quasar: {
    name: 'Quasar',
    hp: 70,
    armor: 2,
    moveSpeed: 3,
    attackType: 'ranged',
    attackRange: 10,
    attackDamage: 9,
    attackRate: 1,
    cost: 60,
    abilityName: 'Stellar Convergence',
    abilityCooldown: 5,
    canDamageStructures: true,
    modifiers: ['ranged'],
  },
};

export interface GameState {
  mode: 'menu' | 'game' | 'settings' | 'unitSelection' | 'victory' | 'mapSelection' | 'multiplayerLobby' | 'countdown' | 'statistics' | 'levelSelection' | 'onlineMode' | 'modifierHelp' | 'unitInformation' | 'lanMode';
  backgroundBattle?: GameState; // Background AI battle for menu
  vsMode: 'ai' | 'player' | 'online' | null;
  
  units: Unit[];
  dyingUnits?: Unit[]; // Units that have died but are still showing queue un-draw animation
  bases: Base[];
  obstacles: import('./maps').Obstacle[];
  projectiles: Projectile[]; // Active projectiles in the game
  
  players: {
    photons: number;
    incomeRate: number;
    color: string;
  }[];
  
  selectedUnits: Set<string>;
  controlGroups: Record<number, Set<string>>; // Number keys 1-8 to unit IDs
  currentFormation: import('./formations').FormationType; // Current formation type for movement commands
  patrolMode: boolean; // Whether patrol mode is active (P key held)
  
  elapsedTime: number;
  lastIncomeTime: number;
  
  winner: number | null;
  
  settings: {
    playerColor: string;
    enemyColor: string;
    enabledUnits: Set<UnitType>;
    unitSlots: Record<'left' | 'up' | 'down' | 'right', UnitType>;
    selectedMap: string;
    showNumericHP: boolean;
    playerFaction: FactionType;
    enemyFaction: FactionType;
    playerBaseType: BaseType;
    enemyBaseType: BaseType;
    enableGlowEffects?: boolean; // Enable/disable glow/shadow effects
    enableParticleEffects?: boolean; // Enable/disable particle effects
    enableMotionBlur?: boolean; // Enable/disable motion blur trails
    mirrorAbilityCasting?: boolean; // Mirror ability casting along both X and Y axes
  };

  surrenderClicks: number;
  lastSurrenderClickTime: number;
  surrenderExpanded: boolean;

  countdownStartTime?: number;
  // Snapshot of the countdown seconds for UI rendering and audio cues.
  countdownSeconds?: number;
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
  
  topographyLines?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  
  // Mobile orientation and visual feedback
  isMobile?: boolean;
  isPortrait?: boolean;
  visualFeedback?: Array<{
    id: string;
    type: 'tap' | 'drag';
    position: Vector2;
    startTime: number;
    endPosition?: Vector2;
  }>;
  
  // Double-tap tracking
  lastTapTime?: number;
  lastTapPosition?: Vector2;
  
  // Background stars for visual effect
  stars?: Array<{
    x: number;
    y: number;
    size: number;
    brightness: number;
    twinkleSpeed: number;
    twinkleOffset: number;
  }>;
  
  // Nebula clouds for atmospheric effect
  nebulaClouds?: Array<{
    x: number;
    y: number;
    size: number;
    color: string;
    opacity: number;
    driftSpeed: number;
  }>;
  
  // Impact effects for hits and explosions
  impactEffects?: Array<{
    id: string;
    position: Vector2;
    color: string;
    startTime: number;
    duration: number;
    size: number;
  }>;
  
  // Floating damage numbers
  damageNumbers?: Array<{
    id: string;
    position: Vector2;
    damage: number;
    color: string;
    startTime: number;
    duration: number;
  }>;
  
  // Performance metrics
  fps?: number;
  lastFpsUpdate?: number;
  frameCount?: number;
  
  // Screen shake effect
  screenShake?: {
    intensity: number;
    duration: number;
    startTime: number;
  };
  
  // Screen flash effect for critical events
  screenFlash?: {
    color: string;
    intensity: number; // 0 to 1
    duration: number; // seconds
    startTime: number;
  };
  
  // Hovered unit for showing range indicators
  hoveredUnit?: Unit | null;
  
  // Tooltip system
  tooltip?: {
    text: string[];
    position: Vector2;
    visible: boolean;
  };
  
  // Minimap settings
  showMinimap?: boolean;
  
  // Camera settings for smooth panning and zooming
  camera?: {
    offset: Vector2;
    targetOffset: Vector2;
    zoom: number;
    targetZoom: number;
    smoothing: number;
  };
  
  // Performance profiling
  performanceProfiling?: {
    enabled: boolean;
    frameTimings: number[];
    updateTime: number;
    renderTime: number;
    avgFrameTime: number;
  };
  
  // Explosion particles for unit deaths
  explosionParticles?: Array<{
    id: string;
    position: Vector2;
    velocity: Vector2;
    color: string;
    size: number;
    lifetime: number;
    createdAt: number;
    alpha: number;
    rotation?: number; // Rotation angle for debris
    rotationSpeed?: number; // Speed of rotation
  }>;
  
  // Enhanced visual effects
  energyPulses?: Array<{
    id: string;
    position: Vector2;
    radius: number;
    color: string;
    startTime: number;
    duration: number;
    maxRadius: number;
  }>;
  
  // Spawn effects for units
  spawnEffects?: Array<{
    id: string;
    position: Vector2;
    color: string;
    startTime: number;
    duration: number;
  }>;
  
  // Hit spark effects
  hitSparks?: Array<{
    id: string;
    position: Vector2;
    velocity: Vector2;
    color: string;
    size: number;
    lifetime: number;
    createdAt: number;
  }>;
  
  // Motion trails for fast units
  motionTrails?: Array<{
    unitId: string;
    positions: Array<{ pos: Vector2; timestamp: number }>;
    color: string;
  }>;
  
  // Victory celebration particles
  celebrationParticles?: Array<{
    id: string;
    position: Vector2;
    velocity: Vector2;
    color: string;
    size: number;
    lifetime: number;
    createdAt: number;
    rotation: number;
    rotationSpeed: number;
  }>;
  
  // Ability cast preview for vector-based input
  abilityCastPreview?: {
    commandOrigin: Vector2; // Position where arrow starts (unit's last queued position or current position)
    dragVector: Vector2; // Direction and distance of the drag in world space
    screenStartPos: Vector2; // Screen position where drag started (for display purposes)
  };
  
  // Multiplayer manager for online games (typed as any to avoid circular dependency with multiplayer.ts)
  multiplayerManager?: import('./multiplayer').MultiplayerManager;
  
  // Network status for online games
  networkStatus?: {
    connected: boolean;
    lastSync: number;
    latency?: number;
  };
}
