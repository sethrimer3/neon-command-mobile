import { GameState, UNIT_DEFINITIONS, UnitType, QUEUE_MAX_LENGTH, MiningDepot } from './types';
import { spawnUnit } from './simulation';
import { distance, add } from './gameUtils';

let lastAIAction = 0;
const AI_ACTION_INTERVAL = 2.0;

// AI difficulty settings
const DIFFICULTY_SETTINGS = {
  easy: {
    actionInterval: 3.0,
    commandChance: 0.2,
    abilityChance: 0.1,
    economicBuildThreshold: 0.4, // 40% chance to build economy when not pressured
    droneSpawnThreshold: 0.3,
  },
  medium: {
    actionInterval: 2.0,
    commandChance: 0.3,
    abilityChance: 0.2,
    economicBuildThreshold: 0.5, // 50% chance to build economy when not pressured
    droneSpawnThreshold: 0.5,
  },
  hard: {
    actionInterval: 1.5,
    commandChance: 0.4,
    abilityChance: 0.3,
    economicBuildThreshold: 0.6, // 60% chance to build economy when not pressured
    droneSpawnThreshold: 0.7,
  },
};

export function updateAI(state: GameState, deltaTime: number, bothPlayersAI: boolean = false): void {
  if (state.vsMode !== 'ai') return;

  const difficulty = state.settings.aiDifficulty || 'medium';
  const difficultyConfig = DIFFICULTY_SETTINGS[difficulty];
  const actionInterval = difficultyConfig.actionInterval;

  lastAIAction += deltaTime;

  if (lastAIAction >= actionInterval) {
    lastAIAction = 0;
    if (bothPlayersAI) {
      // In background battles, both players are AI
      performAIActions(state, 0, difficultyConfig);
      performAIActions(state, 1, difficultyConfig);
    } else {
      // Normal AI vs player mode
      performAIActions(state, 1, difficultyConfig);
    }
  }
}

function performAIActions(state: GameState, aiPlayer: number = 1, difficultyConfig: typeof DIFFICULTY_SETTINGS.medium): void {
  const aiBase = state.bases.find((b) => b.owner === aiPlayer);
  if (!aiBase) return;

  const aiPhotons = state.players[aiPlayer].photons;
  const enemyPlayer = aiPlayer === 0 ? 1 : 0;

  // Assess game state - check enemy aggression
  const enemyUnits = state.units.filter((u) => u.owner === enemyPlayer && u.type !== 'miningDrone');
  const aiUnits = state.units.filter((u) => u.owner === aiPlayer && u.type !== 'miningDrone');
  const enemyAggression = enemyUnits.length / Math.max(1, aiUnits.length);
  
  // If enemy is not aggressive (has fewer units), AI can be more economic
  const shouldBuildEconomy = enemyAggression < 0.8 && Math.random() < difficultyConfig.economicBuildThreshold;

  // Check if AI should spawn mining drones for economy
  const aiMiningDrones = state.units.filter((u) => u.owner === aiPlayer && u.type === 'miningDrone');
  const aiDepots = state.miningDepots.filter((d) => d.owner === aiPlayer);
  
  // Count available deposit slots (max 2 workers per deposit, 8 deposits per depot)
  let totalDepositSlots = 0;
  let occupiedSlots = 0;
  
  aiDepots.forEach((depot) => {
    depot.deposits.forEach((deposit) => {
      totalDepositSlots += 2; // Max 2 workers per deposit
      const workers = (deposit.workerIds || []).filter((workerId) => {
        const worker = state.units.find(u => u.id === workerId);
        return !!worker;
      });
      occupiedSlots += workers.length;
    });
  });

  const availableSlots = totalDepositSlots - occupiedSlots;

  // Decide whether to spawn a unit or a drone
  let shouldSpawnDrone = false;
  
  if (shouldBuildEconomy && availableSlots > 0 && Math.random() < difficultyConfig.droneSpawnThreshold) {
    shouldSpawnDrone = true;
  }

  if (shouldSpawnDrone && aiPhotons >= UNIT_DEFINITIONS.miningDrone.cost) {
    // Spawn mining drone at an available deposit
    for (const depot of aiDepots) {
      for (const deposit of depot.deposits) {
        const workers = (deposit.workerIds || []).filter((workerId) => {
          const worker = state.units.find(u => u.id === workerId);
          return !!worker;
        });
        
        if (workers.length < 2) {
          // Temporarily add miningDrone to enabled units if needed
          const wasMiningDroneEnabled = state.settings.enabledUnits.has('miningDrone');
          if (!wasMiningDroneEnabled) {
            state.settings.enabledUnits.add('miningDrone');
          }
          
          // Spawn drone at this deposit
          const spawned = spawnUnit(state, aiPlayer, 'miningDrone', aiBase.position, deposit.position);
          
          // Restore enabledUnits state if we temporarily modified it
          if (!wasMiningDroneEnabled) {
            state.settings.enabledUnits.delete('miningDrone');
          }
          
          if (spawned) {
            // Find the newly spawned drone - it's the last unit with matching owner and type
            const drone = state.units.slice().reverse().find(u => u.owner === aiPlayer && u.type === 'miningDrone');
            if (drone) {
              drone.miningState = {
                depotId: depot.id,
                depositId: deposit.id,
                atDepot: false,
              };
              
              // Register drone in deposit's worker list
              if (!deposit.workerIds) {
                deposit.workerIds = [];
              }
              deposit.workerIds.push(drone.id);
              
              // Clear the command queue since mining drones should auto-manage their movement
              drone.commandQueue = [];
            }
          }
          return; // Exit after spawning one drone
        }
      }
    }
  } else {
    // Spawn combat units
    const unitTypes: UnitType[] = (['marine', 'warrior', 'snaker', 'tank', 'scout', 'artillery', 'medic', 'interceptor', 'berserker', 'assassin', 'juggernaut', 'striker'] as UnitType[]).filter((type) =>
      state.settings.enabledUnits.has(type)
    );

    if (unitTypes.length === 0) return;

    const chosenType = unitTypes[Math.floor(Math.random() * unitTypes.length)];
    const def = UNIT_DEFINITIONS[chosenType];

    if (aiPhotons >= def.cost) {
      // Use the base's rally point instead of random offsets
      spawnUnit(state, aiPlayer, chosenType, aiBase.position, aiBase.rallyPoint);
    }
  }

  // Give commands to combat units only (not mining drones)
  const aiCombatUnits = state.units.filter((u) => u.owner === aiPlayer && u.type !== 'miningDrone');
  const enemyBase = state.bases.find((b) => b.owner === enemyPlayer);

  if (enemyBase) {
    aiCombatUnits.forEach((unit) => {
      // In chess mode, add to pending commands instead of immediate queue
      if (state.settings.chessMode && state.chessMode) {
        // Only give command if unit doesn't already have a pending command
        if (!state.chessMode.pendingCommands.has(unit.id) && Math.random() < difficultyConfig.commandChance) {
          const targetPos = {
            x: enemyBase.position.x + (Math.random() - 0.5) * 10,
            y: enemyBase.position.y + (Math.random() - 0.5) * 10,
          };
          
          state.chessMode.pendingCommands.set(unit.id, [{ type: 'move', position: targetPos }]);
        }
      } else {
        // Normal RTS mode
        if (unit.commandQueue.length < 3 && Math.random() < difficultyConfig.commandChance) {
          const targetPos = {
            x: enemyBase.position.x + (Math.random() - 0.5) * 10,
            y: enemyBase.position.y + (Math.random() - 0.5) * 10,
          };

          if (unit.commandQueue.length < QUEUE_MAX_LENGTH) {
            unit.commandQueue.push({ type: 'move', position: targetPos });
          }
        }

        if (unit.abilityCooldown === 0 && Math.random() < difficultyConfig.abilityChance && unit.commandQueue.length < QUEUE_MAX_LENGTH) {
          const direction = {
            x: enemyBase.position.x - unit.position.x,
            y: enemyBase.position.y - unit.position.y,
          };
          
          unit.commandQueue.push({ 
            type: 'ability', 
            position: unit.position, 
            direction 
          });
        }
      }
    });
  }
}
