/**
 * Multiplayer game integration - handles command synchronization between players
 */

import { GameState, CommandNode, Unit, LASER_RANGE, LASER_WIDTH, LASER_DAMAGE_UNIT, LASER_DAMAGE_BASE, LASER_COOLDOWN, BASE_SIZE_METERS, UnitType, UNIT_DEFINITIONS } from './types';
import { MultiplayerManager, GameCommand } from './multiplayer';
import { spawnUnit } from './simulation';

export interface MultiplayerSync {
  // Timestamp of the last polling attempt so we can throttle network checks.
  lastCommandCheck: number;
  // Sequence number of the last command processed from the stream.
  lastCommandSeq: number;
  // Buffer for any queued commands (reserved for future batching).
  commandBuffer: GameCommand[];
}

// Configuration constants
const COMMAND_POLL_INTERVAL_MS = 100; // How often to check for new opponent commands

/**
 * Initialize multiplayer synchronization state for a game
 */
export function initializeMultiplayerSync(): MultiplayerSync {
  return {
    lastCommandCheck: Date.now(),
    lastCommandSeq: 0,
    commandBuffer: [],
  };
}

/**
 * Send a spawn command to the multiplayer backend
 */
export async function sendSpawnCommand(
  manager: MultiplayerManager,
  playerIndex: number,
  unitType: string,
  baseId: string,
  rallyPosition: { x: number; y: number }
): Promise<void> {
  await manager.sendCommand({
    commands: [{
      type: 'spawn',
      baseId,
      spawnType: unitType,
      position: rallyPosition,
    }],
  });
}

/**
 * Send movement commands for selected units
 */
export async function sendMoveCommand(
  manager: MultiplayerManager,
  unitIds: string[],
  position: { x: number; y: number },
  isAttackMove: boolean = false
): Promise<void> {
  await manager.sendCommand({
    commands: [{
      type: isAttackMove ? 'ability' : 'move',
      unitIds,
      position,
    }],
  });
}

/**
 * Send ability command for selected units
 */
export async function sendAbilityCommand(
  manager: MultiplayerManager,
  unitIds: string[],
  position: { x: number; y: number },
  direction: { x: number; y: number }
): Promise<void> {
  await manager.sendCommand({
    commands: [{
      type: 'ability',
      unitIds,
      position,
      direction,
    }],
  });
}

/**
 * Send base movement command
 */
export async function sendBaseMoveCommand(
  manager: MultiplayerManager,
  baseId: string,
  position: { x: number; y: number }
): Promise<void> {
  await manager.sendCommand({
    commands: [{
      type: 'baseMove',
      baseId,
      position,
    }],
  });
}

/**
 * Send base laser command
 */
export async function sendBaseLaserCommand(
  manager: MultiplayerManager,
  baseId: string,
  direction: { x: number; y: number }
): Promise<void> {
  await manager.sendCommand({
    commands: [{
      type: 'baseLaser',
      baseId,
      direction,
    }],
  });
}

/**
 * Send unit selection command (for synchronization)
 */
export async function sendSelectCommand(
  manager: MultiplayerManager,
  unitIds: string[]
): Promise<void> {
  await manager.sendCommand({
    commands: [{
      type: 'select',
      unitIds,
    }],
  });
}

/**
 * Process received commands from opponent and apply them to game state
 */
export function applyOpponentCommands(
  state: GameState,
  commands: GameCommand[],
  opponentIndex: number
): void {
  for (const cmd of commands) {
    for (const command of cmd.commands) {
      try {
        switch (command.type) {
          case 'spawn':
            if (command.baseId && command.spawnType && command.position) {
              const base = state.bases.find(b => b.id === command.baseId && b.owner === opponentIndex);
              if (base) {
                // Validate spawnType using available unit types from UNIT_DEFINITIONS
                const validUnitTypes = Object.keys(UNIT_DEFINITIONS) as UnitType[];
                if (validUnitTypes.includes(command.spawnType as UnitType)) {
                  spawnUnit(state, opponentIndex, command.spawnType as UnitType, base.position, command.position);
                }
              }
            }
            break;

          case 'move':
            if (command.unitIds && command.position) {
              command.unitIds.forEach(unitId => {
                const unit = state.units.find(u => u.id === unitId && u.owner === opponentIndex);
                if (unit) {
                  unit.commandQueue = [{ type: 'move', position: command.position! }];
                }
              });
            }
            break;

          case 'ability':
            if (command.unitIds && command.position && command.direction) {
              command.unitIds.forEach(unitId => {
                const unit = state.units.find(u => u.id === unitId && u.owner === opponentIndex);
                if (unit) {
                  const abilityNode: CommandNode = {
                    type: 'ability',
                    position: command.position!,
                    direction: command.direction!,
                  };
                  unit.commandQueue = [abilityNode];
                }
              });
            }
            break;

          case 'baseMove':
            if (command.baseId && command.position) {
              const base = state.bases.find(b => b.id === command.baseId && b.owner === opponentIndex);
              if (base) {
                base.movementTarget = command.position;
              }
            }
            break;

          case 'baseLaser':
            if (command.baseId && command.direction) {
              const base = state.bases.find(b => b.id === command.baseId && b.owner === opponentIndex);
              if (base && base.laserCooldown === 0) {
                // Set up the laser beam visual
                base.laserBeam = {
                  endTime: Date.now() + 500,
                  direction: command.direction,
                };
                base.laserCooldown = LASER_COOLDOWN;
                
                // Apply laser damage
                state.units.forEach((unit) => {
                  if (unit.owner === base.owner) return;

                  const toUnit = { x: unit.position.x - base.position.x, y: unit.position.y - base.position.y };
                  const projectedDist = toUnit.x * command.direction!.x + toUnit.y * command.direction!.y;
                  const perpDist = Math.abs(toUnit.x * command.direction!.y - toUnit.y * command.direction!.x);

                  if (projectedDist > 0 && projectedDist < LASER_RANGE && perpDist < LASER_WIDTH / 2) {
                    unit.hp -= LASER_DAMAGE_UNIT;
                  }
                });

                state.bases.forEach((targetBase) => {
                  if (targetBase.owner === base.owner) return;

                  const toBase = { x: targetBase.position.x - base.position.x, y: targetBase.position.y - base.position.y };
                  const projectedDist = toBase.x * command.direction!.x + toBase.y * command.direction!.y;
                  const perpDist = Math.abs(toBase.x * command.direction!.y - toBase.y * command.direction!.x);

                  const baseRadius = BASE_SIZE_METERS / 2;
                  if (projectedDist > 0 && projectedDist < LASER_RANGE && perpDist < LASER_WIDTH / 2 + baseRadius) {
                    targetBase.hp -= LASER_DAMAGE_BASE;
                  }
                });
              }
            }
            break;

          case 'select':
            // Selection commands are informational and don't need to be applied
            // They can be used for UI feedback if needed in the future
            break;
        }
      } catch (error) {
        console.warn('Error applying opponent command:', error, command);
      }
    }
  }
}

/**
 * Update multiplayer synchronization - fetch and apply opponent commands
 * This should be called in the game loop for online games
 */
export async function updateMultiplayerSync(
  state: GameState,
  manager: MultiplayerManager,
  sync: MultiplayerSync,
  localPlayerIndex: number
): Promise<void> {
  const now = Date.now();
  
  // Check for new commands at configured interval
  if (now - sync.lastCommandCheck < COMMAND_POLL_INTERVAL_MS) {
    return;
  }
  
  // Initialize network status if not present
  if (!state.networkStatus) {
    state.networkStatus = {
      connected: true,
      lastSync: now,
    };
  }
  
  const syncStart = now;
  const wasConnected = state.networkStatus.connected;
  
  try {
    const { commands: newCommands, latestSeq } = await manager.getCommands(sync.lastCommandSeq);
    
    if (newCommands.length > 0) {
      // Filter out our own commands (we already applied them locally)
      const opponentCommands = newCommands.filter(cmd => cmd.playerId !== manager.getPlayerId());
      
      if (opponentCommands.length > 0) {
        const opponentIndex = localPlayerIndex === 0 ? 1 : 0;
        applyOpponentCommands(state, opponentCommands, opponentIndex);
      }
    }
    
    sync.lastCommandSeq = latestSeq;
    sync.lastCommandCheck = now;
    
    // Update network status - successfully connected
    if (!wasConnected) {
      // Reconnected after being disconnected
      console.log('Reconnected to multiplayer backend');
    }
    state.networkStatus.connected = true;
    state.networkStatus.lastSync = now;
    state.networkStatus.latency = Date.now() - syncStart;
  } catch (error) {
    console.warn('Error fetching opponent commands:', error);
    
    // Mark as disconnected
    state.networkStatus.connected = false;
    
    // Log disconnection on first occurrence
    if (wasConnected) {
      console.error('Lost connection to multiplayer backend');
    }
  }
}

/**
 * Synchronize full game state (host only)
 * This ensures both players stay in sync even with packet loss
 */
export async function syncGameState(
  state: GameState,
  manager: MultiplayerManager,
  isHost: boolean
): Promise<void> {
  if (!isHost) return;
  
  try {
    await manager.syncGameState({
      units: state.units,
      bases: state.bases,
      players: state.players,
      elapsedTime: state.elapsedTime,
      winner: state.winner,
    });
  } catch (error) {
    console.warn('Error syncing game state:', error);
  }
}
