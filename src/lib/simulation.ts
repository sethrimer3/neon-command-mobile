import {
  GameState,
  Unit,
  Base,
  UnitType,
  Vector2,
  UNIT_DEFINITIONS,
  CommandNode,
  PROMOTION_DISTANCE_THRESHOLD,
  PROMOTION_MULTIPLIER,
  QUEUE_BONUS_PER_NODE,
  BASE_SIZE_METERS,
  UNIT_SIZE_METERS,
} from './types';
import { distance, normalize, scale, add, subtract, generateId } from './gameUtils';
import { checkObstacleCollision } from './maps';
import { soundManager } from './sound';

export function updateGame(state: GameState, deltaTime: number): void {
  if (state.mode !== 'game') return;

  state.elapsedTime += deltaTime;

  updateIncome(state, deltaTime);
  updateUnits(state, deltaTime);
  updateBases(state, deltaTime);
  updateCombat(state, deltaTime);
  checkTimeLimit(state);
  checkVictory(state);
}

function updateIncome(state: GameState, deltaTime: number): void {
  const elapsedSeconds = Math.floor(state.elapsedTime);
  const newIncomeRate = Math.floor(elapsedSeconds / 10) + 1;

  state.players.forEach((player) => {
    player.incomeRate = newIncomeRate;
  });

  state.lastIncomeTime += deltaTime;
  if (state.lastIncomeTime >= 1.0) {
    state.lastIncomeTime -= 1.0;
    state.players.forEach((player, index) => {
      player.photons += player.incomeRate;
      if (index === 0) {
        soundManager.playIncomeTick();
      }
    });
  }
}

function updateUnits(state: GameState, deltaTime: number): void {
  state.units.forEach((unit) => {
    if (unit.abilityCooldown > 0) {
      unit.abilityCooldown = Math.max(0, unit.abilityCooldown - deltaTime);
    }

    updateAbilityEffects(unit, state, deltaTime);

    if (unit.lineJumpTelegraph) {
      const elapsed = Date.now() - unit.lineJumpTelegraph.startTime;
      if (elapsed >= 500) {
        executeLineJump(state, unit);
        unit.lineJumpTelegraph = undefined;
      }
      return;
    }

    if (unit.commandQueue.length === 0) return;

    const currentNode = unit.commandQueue[0];

    if (currentNode.type === 'move') {
      const dist = distance(unit.position, currentNode.position);
      const def = UNIT_DEFINITIONS[unit.type];

      if (dist < 0.1) {
        unit.commandQueue.shift();
        return;
      }

      const direction = normalize(subtract(currentNode.position, unit.position));
      const movement = scale(direction, def.moveSpeed * deltaTime);

      const moveDist = Math.min(distance(unit.position, add(unit.position, movement)), dist);
      const newPosition = add(unit.position, scale(direction, moveDist));
      
      if (!checkObstacleCollision(newPosition, UNIT_SIZE_METERS / 2, state.obstacles)) {
        unit.position = newPosition;
      } else {
        unit.commandQueue.shift();
        return;
      }

      const queueMovementNodes = unit.commandQueue.filter((n) => n.type === 'move').length;
      const creditMultiplier = 1.0 + QUEUE_BONUS_PER_NODE * queueMovementNodes;
      unit.distanceCredit += moveDist * creditMultiplier;

      while (unit.distanceCredit >= PROMOTION_DISTANCE_THRESHOLD) {
        unit.distanceCredit -= PROMOTION_DISTANCE_THRESHOLD;
        unit.damageMultiplier *= PROMOTION_MULTIPLIER;
      }

      unit.distanceTraveled += moveDist;
    } else if (currentNode.type === 'ability') {
      const dist = distance(unit.position, currentNode.position);
      if (dist > 0.1) {
        const def = UNIT_DEFINITIONS[unit.type];
        const direction = normalize(subtract(currentNode.position, unit.position));
        const movement = scale(direction, def.moveSpeed * deltaTime);
        unit.position = add(unit.position, movement);

        const queueMovementNodes = unit.commandQueue.filter((n) => n.type === 'move').length;
        const creditMultiplier = 1.0 + QUEUE_BONUS_PER_NODE * queueMovementNodes;
        const moveDist = Math.min(distance({ x: 0, y: 0 }, movement), dist);
        unit.distanceCredit += moveDist * creditMultiplier;

        while (unit.distanceCredit >= PROMOTION_DISTANCE_THRESHOLD) {
          unit.distanceCredit -= PROMOTION_DISTANCE_THRESHOLD;
          unit.damageMultiplier *= PROMOTION_MULTIPLIER;
        }

        unit.distanceTraveled += moveDist;
      } else {
        executeAbility(state, unit, currentNode);
        unit.commandQueue.shift();
      }
    }
  });
}

function updateAbilityEffects(unit: Unit, state: GameState, deltaTime: number): void {
  const now = Date.now();

  if (unit.shieldActive && now > unit.shieldActive.endTime) {
    unit.shieldActive = undefined;
  }

  if (unit.cloaked && now > unit.cloaked.endTime) {
    unit.cloaked = undefined;
  }

  if (unit.bombardmentActive) {
    if (now > unit.bombardmentActive.impactTime && now < unit.bombardmentActive.endTime) {
      const enemies = state.units.filter((u) => u.owner !== unit.owner);
      enemies.forEach((enemy) => {
        if (distance(enemy.position, unit.bombardmentActive!.targetPos) <= 3) {
          const damage = 40 * unit.damageMultiplier * deltaTime;
          enemy.hp -= damage;
          
          if (state.matchStats && unit.owner === 0) {
            state.matchStats.damageDealtByPlayer += damage;
          }
        }
      });

      const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);
      enemyBases.forEach((base) => {
        if (distance(base.position, unit.bombardmentActive!.targetPos) <= 3) {
          const damage = 80 * unit.damageMultiplier * deltaTime;
          base.hp -= damage;
          
          if (state.matchStats && unit.owner === 0) {
            state.matchStats.damageDealtByPlayer += damage;
          }
        }
      });
    }

    if (now > unit.bombardmentActive.endTime) {
      unit.bombardmentActive = undefined;
    }
  }

  if (unit.healPulseActive && now > unit.healPulseActive.endTime) {
    unit.healPulseActive = undefined;
  }

  if (unit.missileBarrageActive) {
    const progress = Math.min(1, (now - (unit.missileBarrageActive.endTime - 1500)) / 1500);
    
    if (progress >= 1) {
      unit.missileBarrageActive.missiles.forEach((missile) => {
        const enemies = state.units.filter((u) => u.owner !== unit.owner);
        const target = enemies.find((e) => distance(e.position, missile.target) < 0.5);
        if (target) {
          target.hp -= missile.damage;
          
          if (state.matchStats && unit.owner === 0) {
            state.matchStats.damageDealtByPlayer += missile.damage;
          }
        }
      });
      unit.missileBarrageActive = undefined;
    }
  }
}

function updateBases(state: GameState, deltaTime: number): void {
  state.bases.forEach((base) => {
    if (base.laserCooldown > 0) {
      base.laserCooldown = Math.max(0, base.laserCooldown - deltaTime);
    }

    if (!base.movementTarget) return;

    const dist = distance(base.position, base.movementTarget);
    if (dist < 0.1) {
      base.movementTarget = null;
      return;
    }

    const direction = normalize(subtract(base.movementTarget, base.position));
    const movement = scale(direction, 1.0 * deltaTime);
    base.position = add(base.position, movement);
  });
}

function executeAbility(state: GameState, unit: Unit, node: CommandNode): void {
  if (node.type !== 'ability') return;
  if (unit.abilityCooldown > 0) return;

  const def = UNIT_DEFINITIONS[unit.type];

  soundManager.playAbility();

  if (unit.type === 'marine') {
    executeBurstFire(state, unit, node.direction);
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'warrior') {
    executeExecuteDash(state, unit, node.position);
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'snaker') {
    unit.lineJumpTelegraph = {
      startTime: Date.now(),
      endPos: add(unit.position, scale(normalize(node.direction), Math.min(distance({ x: 0, y: 0 }, node.direction), 10))),
      direction: normalize(node.direction),
    };
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'tank') {
    executeShieldDome(state, unit);
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'scout') {
    executeCloak(state, unit);
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'artillery') {
    executeArtilleryBombardment(state, unit, node.position);
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'medic') {
    executeHealPulse(state, unit);
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'interceptor') {
    executeMissileBarrage(state, unit, node.direction);
    unit.abilityCooldown = def.abilityCooldown;
  }
}

function executeBurstFire(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const def = UNIT_DEFINITIONS.marine;
  const shotDamage = 2 * unit.damageMultiplier;
  const maxRange = def.attackRange;

  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);

  const dir = normalize(direction);

  for (let i = 0; i < 10; i++) {
    let hitTarget: Unit | Base | null = null;
    let minDist = Infinity;

    enemies.forEach((enemy) => {
      const toEnemy = subtract(enemy.position, unit.position);
      const dist = distance(unit.position, enemy.position);
      if (dist > maxRange) return;

      const projectedDist = toEnemy.x * dir.x + toEnemy.y * dir.y;
      const perpDist = Math.abs(toEnemy.x * dir.y - toEnemy.y * dir.x);

      if (projectedDist > 0 && perpDist < UNIT_SIZE_METERS / 2 && dist < minDist) {
        minDist = dist;
        hitTarget = enemy;
      }
    });

    if (hitTarget) {
      (hitTarget as Unit).hp -= shotDamage;
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += shotDamage;
      }
    }
  }
}

function executeExecuteDash(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const nearbyEnemies = enemies.filter((e) => distance(e.position, targetPos) <= 2);

  if (nearbyEnemies.length === 0) return;

  let nearest = nearbyEnemies[0];
  let minDist = distance(unit.position, nearest.position);

  nearbyEnemies.forEach((enemy) => {
    const dist = distance(unit.position, enemy.position);
    if (dist < minDist) {
      minDist = dist;
      nearest = enemy;
    }
  });

  unit.position = { ...nearest.position };
  const def = UNIT_DEFINITIONS.warrior;
  const damage = def.attackDamage * 5 * unit.damageMultiplier;
  nearest.hp -= damage;
  
  if (state.matchStats && unit.owner === 0) {
    state.matchStats.damageDealtByPlayer += damage;
  }
  
  unit.dashExecuting = true;
  setTimeout(() => {
    unit.dashExecuting = false;
  }, 200);
}

function executeLineJump(state: GameState, unit: Unit): void {
  if (!unit.lineJumpTelegraph) return;

  const { endPos, direction } = unit.lineJumpTelegraph;
  const startPos = { ...unit.position };

  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const hitEnemies = new Set<string>();

  const jumpDist = distance(startPos, endPos);
  const steps = Math.ceil(jumpDist * 10);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const checkPos = {
      x: startPos.x + (endPos.x - startPos.x) * t,
      y: startPos.y + (endPos.y - startPos.y) * t,
    };

    enemies.forEach((enemy) => {
      if (hitEnemies.has(enemy.id)) return;
      if (distance(enemy.position, checkPos) < UNIT_SIZE_METERS) {
        const damage = 20 * unit.damageMultiplier;
        enemy.hp -= damage;
        hitEnemies.add(enemy.id);
        
        if (state.matchStats && unit.owner === 0) {
          state.matchStats.damageDealtByPlayer += damage;
        }
      }
    });
  }

  unit.position = endPos;
}

function executeShieldDome(state: GameState, unit: Unit): void {
  unit.shieldActive = {
    endTime: Date.now() + 5000,
    radius: 4,
  };
}

function executeCloak(state: GameState, unit: Unit): void {
  unit.cloaked = {
    endTime: Date.now() + 6000,
  };
}

function executeArtilleryBombardment(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  unit.bombardmentActive = {
    endTime: Date.now() + 2000,
    targetPos,
    impactTime: Date.now() + 1500,
  };
}

function executeHealPulse(state: GameState, unit: Unit): void {
  const healAmount = 50;
  const healRadius = 5;
  
  unit.healPulseActive = {
    endTime: Date.now() + 1000,
    radius: healRadius,
  };

  const allies = state.units.filter((u) => u.owner === unit.owner);
  allies.forEach((ally) => {
    if (distance(ally.position, unit.position) <= healRadius) {
      ally.hp = Math.min(ally.hp + healAmount, ally.maxHp);
    }
  });

  const allyBases = state.bases.filter((b) => b.owner === unit.owner);
  allyBases.forEach((base) => {
    if (distance(base.position, unit.position) <= healRadius) {
      base.hp = Math.min(base.hp + healAmount * 2, base.maxHp);
    }
  });
}

function executeMissileBarrage(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const dir = normalize(direction);
  
  const missiles: Array<{ position: Vector2; target: Vector2; damage: number }> = [];
  
  const enemiesInDirection = enemies.filter((e) => {
    const toEnemy = subtract(e.position, unit.position);
    const dist = distance(unit.position, e.position);
    if (dist > 12) return false;
    
    const projectedDist = toEnemy.x * dir.x + toEnemy.y * dir.y;
    return projectedDist > 0;
  }).sort((a, b) => distance(unit.position, a.position) - distance(unit.position, b.position));

  for (let i = 0; i < Math.min(6, enemiesInDirection.length); i++) {
    missiles.push({
      position: { ...unit.position },
      target: { ...enemiesInDirection[i].position },
      damage: 15 * unit.damageMultiplier,
    });
  }

  unit.missileBarrageActive = {
    endTime: Date.now() + 1500,
    missiles,
  };
}

function updateCombat(state: GameState, deltaTime: number): void {
  state.units.forEach((unit) => {
    const def = UNIT_DEFINITIONS[unit.type];
    if (def.attackType === 'none') return;

    const enemies = state.units.filter((u) => u.owner !== unit.owner && !u.cloaked);
    const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);

    let target: Unit | Base | null = null;
    let minDist = Infinity;

    enemies.forEach((enemy) => {
      const dist = distance(unit.position, enemy.position);
      if (dist <= def.attackRange && dist < minDist) {
        minDist = dist;
        target = enemy;
      }
    });

    if (!target && def.canDamageStructures) {
      enemyBases.forEach((base) => {
        const dist = distance(unit.position, base.position);
        const baseRadius = BASE_SIZE_METERS / 2;
        if (dist <= def.attackRange + baseRadius && dist < minDist) {
          minDist = dist;
          target = base;
        }
      });
    }

    if (target) {
      let damage = def.attackDamage * def.attackRate * deltaTime * unit.damageMultiplier;

      if ('type' in target) {
        const targetUnit = target as Unit;
        
        if (targetUnit.shieldActive) {
          const allies = state.units.filter((u) => 
            u.owner === targetUnit.owner && 
            u.shieldActive && 
            distance(u.position, targetUnit.position) <= u.shieldActive.radius
          );
          if (allies.length > 0) {
            damage *= 0.3;
          }
        }

        targetUnit.hp -= damage;
        
        if (state.matchStats && unit.owner === 0) {
          state.matchStats.damageDealtByPlayer += damage;
        }
        
        if (unit.owner === 0 && Math.random() < 0.05) {
          soundManager.playAttack();
        }
      } else {
        const targetBase = target as Base;
        targetBase.hp -= damage;
        
        if (state.matchStats) {
          if (targetBase.owner === 0) {
            state.matchStats.damageToPlayerBase += damage;
          } else {
            state.matchStats.damageToEnemyBase += damage;
          }
          
          if (unit.owner === 0) {
            state.matchStats.damageDealtByPlayer += damage;
          }
        }
        
        if (unit.owner === 0 && Math.random() < 0.1) {
          soundManager.playBaseDamage();
        }
      }
    }
  });

  const beforeFilter = state.units.length;
  const unitsByOwner = state.units.reduce((acc, u) => {
    acc[u.owner] = (acc[u.owner] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  
  const oldUnits = [...state.units];
  state.units = state.units.filter((u) => u.hp > 0);
  
  oldUnits.forEach(u => {
    if (u.hp <= 0) {
      soundManager.playUnitDeath();
    }
  });
  
  if (state.matchStats) {
    const afterUnitsByOwner = state.units.reduce((acc, u) => {
      acc[u.owner] = (acc[u.owner] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
    
    const enemyUnitsKilled = (unitsByOwner[1] || 0) - (afterUnitsByOwner[1] || 0);
    state.matchStats.unitsKilledByPlayer += enemyUnitsKilled;
  }
}

function checkVictory(state: GameState): void {
  state.bases.forEach((base) => {
    if (base.hp <= 0) {
      soundManager.playBaseDestroyed();
      state.winner = base.owner === 0 ? 1 : 0;
      state.mode = 'victory';
    }
  });
}

function checkTimeLimit(state: GameState): void {
  if (!state.matchTimeLimit) return;
  if (state.winner !== null) return;
  
  const timeRemaining = state.matchTimeLimit - state.elapsedTime;
  
  if (timeRemaining <= 30 && timeRemaining > 29 && !state.timeoutWarningShown) {
    state.timeoutWarningShown = true;
  }
  
  if (state.elapsedTime >= state.matchTimeLimit) {
    const playerBase = state.bases.find(b => b.owner === 0);
    const enemyBase = state.bases.find(b => b.owner === 1);
    
    if (!playerBase || !enemyBase) return;
    
    const playerBaseDamage = playerBase.maxHp - playerBase.hp;
    const enemyBaseDamage = enemyBase.maxHp - enemyBase.hp;
    
    if (playerBaseDamage < enemyBaseDamage) {
      state.winner = 0;
      state.mode = 'victory';
    } else if (enemyBaseDamage < playerBaseDamage) {
      state.winner = 1;
      state.mode = 'victory';
    } else {
      if (state.matchStats) {
        const playerUnitDamage = state.matchStats.damageDealtByPlayer;
        const enemyUnitDamage = state.matchStats.damageToPlayerBase;
        
        if (playerUnitDamage > enemyUnitDamage) {
          state.winner = 0;
          state.mode = 'victory';
        } else if (enemyUnitDamage > playerUnitDamage) {
          state.winner = 1;
          state.mode = 'victory';
        } else {
          state.winner = -1;
          state.mode = 'victory';
        }
      } else {
        state.winner = -1;
        state.mode = 'victory';
      }
    }
  }
}

export function spawnUnit(state: GameState, owner: number, type: UnitType, spawnPos: { x: number; y: number }, rallyPos: { x: number; y: number }): void {
  const def = UNIT_DEFINITIONS[type];

  if (state.players[owner].photons < def.cost) return;
  if (!state.settings.enabledUnits.has(type)) return;

  state.players[owner].photons -= def.cost;

  if (state.matchStats && owner === 0) {
    state.matchStats.unitsTrainedByPlayer += 1;
    state.matchStats.photonsSpentByPlayer += def.cost;
  }

  if (owner === 0) {
    soundManager.playUnitTrain();
  }

  const unit: Unit = {
    id: generateId(),
    type,
    owner,
    position: spawnPos,
    hp: def.hp,
    maxHp: def.hp,
    commandQueue: [{ type: 'move', position: rallyPos }],
    damageMultiplier: 1.0,
    distanceTraveled: 0,
    distanceCredit: 0,
    abilityCooldown: 0,
  };

  state.units.push(unit);
}
