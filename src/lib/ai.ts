import { GameState, UNIT_DEFINITIONS, UnitType, QUEUE_MAX_LENGTH } from './types';
import { spawnUnit } from './simulation';
import { distance, add } from './gameUtils';

let lastAIAction = 0;
const AI_ACTION_INTERVAL = 2.0;

export function updateAI(state: GameState, deltaTime: number, bothPlayersAI: boolean = false): void {
  if (state.vsMode !== 'ai') return;

  lastAIAction += deltaTime;

  if (lastAIAction >= AI_ACTION_INTERVAL) {
    lastAIAction = 0;
    if (bothPlayersAI) {
      // In background battles, both players are AI
      performAIActions(state, 0);
      performAIActions(state, 1);
    } else {
      // Normal AI vs player mode
      performAIActions(state, 1);
    }
  }
}

function performAIActions(state: GameState, aiPlayer: number = 1): void {
  const aiBase = state.bases.find((b) => b.owner === aiPlayer);
  if (!aiBase) return;

  const aiPhotons = state.players[aiPlayer].photons;

  const unitTypes: UnitType[] = (['marine', 'warrior', 'snaker', 'tank', 'scout', 'artillery', 'medic', 'interceptor', 'berserker', 'assassin', 'juggernaut', 'striker'] as UnitType[]).filter((type) =>
    state.settings.enabledUnits.has(type)
  );

  if (unitTypes.length === 0) return;

  const chosenType = unitTypes[Math.floor(Math.random() * unitTypes.length)];
  const def = UNIT_DEFINITIONS[chosenType];

  if (aiPhotons >= def.cost) {
    const rallyOffsets = [
      { x: -8, y: 0 },
      { x: 0, y: -8 },
      { x: 0, y: 8 },
    ];
    const rallyOffset = rallyOffsets[Math.floor(Math.random() * rallyOffsets.length)];
    const rallyPos = add(aiBase.position, rallyOffset);

    spawnUnit(state, aiPlayer, chosenType, aiBase.position, rallyPos);
  }

  const aiUnits = state.units.filter((u) => u.owner === aiPlayer);
  const enemyPlayer = aiPlayer === 0 ? 1 : 0;
  const enemyBase = state.bases.find((b) => b.owner === enemyPlayer);

  if (enemyBase) {
    aiUnits.forEach((unit) => {
      if (unit.commandQueue.length < 3 && Math.random() < 0.3) {
        const targetPos = {
          x: enemyBase.position.x + (Math.random() - 0.5) * 10,
          y: enemyBase.position.y + (Math.random() - 0.5) * 10,
        };

        if (unit.commandQueue.length < QUEUE_MAX_LENGTH) {
          unit.commandQueue.push({ type: 'move', position: targetPos });
        }
      }

      if (unit.abilityCooldown === 0 && Math.random() < 0.2 && unit.commandQueue.length < QUEUE_MAX_LENGTH) {
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
    });
  }
}
