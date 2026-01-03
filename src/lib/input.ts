import {
  GameState,
  Unit,
  CommandNode,
  Base,
  UnitType,
  QUEUE_MAX_LENGTH,
  ABILITY_MAX_RANGE,
  LASER_RANGE,
  LASER_WIDTH,
  LASER_DAMAGE_UNIT,
  LASER_DAMAGE_BASE,
  LASER_COOLDOWN,
  BASE_SIZE_METERS,
  UNIT_SIZE_METERS,
  UNIT_DEFINITIONS,
  PIXELS_PER_METER,
  Vector2,
} from './types';
import { distance, normalize, scale, add, subtract, pixelsToPosition, positionToPixels } from './gameUtils';
import { spawnUnit } from './simulation';
import { soundManager } from './sound';
import { applyFormation } from './formations';
import { createLaserParticles, createEnergyPulse } from './visualEffects';
import { sendMoveCommand, sendAbilityCommand, sendBaseMoveCommand, sendBaseLaserCommand, sendSpawnCommand } from './multiplayerGame';

interface TouchState {
  startPos: { x: number; y: number };
  startTime: number;
  isDragging: boolean;
  selectedUnitsSnapshot: Set<string>;
  selectionRect?: { x1: number; y1: number; x2: number; y2: number };
  touchedBase?: Base;
  touchedMovementDot?: { base: Base; dotPos: { x: number; y: number } };
}

const touchStates = new Map<number, TouchState>();
let mouseState: TouchState | null = null;

const SWIPE_THRESHOLD_PX = 30;
const TAP_TIME_MS = 300;
const HOLD_TIME_MS = 200;
const DOUBLE_TAP_TIME_MS = 400; // Time window for double-tap detection
const DOUBLE_TAP_DISTANCE_PX = 50; // Max distance between taps to count as double-tap

function addVisualFeedback(state: GameState, type: 'tap' | 'drag', position: { x: number; y: number }, endPosition?: { x: number; y: number }): void {
  if (!state.visualFeedback) {
    state.visualFeedback = [];
  }
  
  const worldPos = pixelsToPosition(position);
  const feedback: {
    id: string;
    type: 'tap' | 'drag';
    position: { x: number; y: number };
    startTime: number;
    endPosition?: { x: number; y: number };
  } = {
    id: Math.random().toString(36).substring(2, 15),
    type,
    position: worldPos,
    startTime: Date.now(),
  };
  
  if (endPosition) {
    feedback.endPosition = pixelsToPosition(endPosition);
  }
  
  state.visualFeedback.push(feedback);
  
  // Clean up old feedback (older than 500ms)
  const now = Date.now();
  state.visualFeedback = state.visualFeedback.filter(f => now - f.startTime < 500);
}

function transformCoordinates(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  
  return { x, y };
}

export function handleTouchStart(e: TouchEvent, state: GameState, canvas: HTMLCanvasElement): void {
  if (state.mode !== 'game') return;
  e.preventDefault();

  Array.from(e.changedTouches).forEach((touch) => {
    const rect = canvas.getBoundingClientRect();
    const { x, y } = transformCoordinates(touch.clientX, touch.clientY, rect);
    const worldPos = pixelsToPosition({ x, y });
    
    // Add visual feedback for touch start
    addVisualFeedback(state, 'tap', { x, y });

    const playerIndex = state.vsMode === 'player' && x > canvas.width / 2 ? 1 : 0;

    const touchedBase = findTouchedBase(state, worldPos, playerIndex);
    const touchedDot = findTouchedMovementDot(state, worldPos, playerIndex);

    touchStates.set(touch.identifier, {
      startPos: { x, y },
      startTime: Date.now(),
      isDragging: false,
      selectedUnitsSnapshot: new Set(state.selectedUnits),
      touchedBase,
      touchedMovementDot: touchedDot,
    });
  });
}

export function handleTouchMove(e: TouchEvent, state: GameState, canvas: HTMLCanvasElement): void {
  if (state.mode !== 'game') return;
  e.preventDefault();

  Array.from(e.changedTouches).forEach((touch) => {
    const touchState = touchStates.get(touch.identifier);
    if (!touchState) return;

    const rect = canvas.getBoundingClientRect();
    const { x, y } = transformCoordinates(touch.clientX, touch.clientY, rect);

    const dx = x - touchState.startPos.x;
    const dy = y - touchState.startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 10 && !touchState.isDragging) {
      touchState.isDragging = true;

      const elapsed = Date.now() - touchState.startTime;
      // Only create selection rect if no units are selected AND no base touched
      // When units are selected, dragging will be for ability casting instead
      const playerIndex = state.vsMode === 'player' && touchState.startPos.x > canvas.width / 2 ? 1 : 0;
      const selectedBase = getSelectedBase(state, playerIndex);

      // Skip selection rects when the base is selected so swipes spawn units anywhere
      if (!touchState.touchedBase && state.selectedUnits.size === 0 && !selectedBase) {
        touchState.selectionRect = {
          x1: touchState.startPos.x,
          y1: touchState.startPos.y,
          x2: x,
          y2: y,
        };
      }
    }

    if (touchState.selectionRect) {
      touchState.selectionRect.x2 = x;
      touchState.selectionRect.y2 = y;
    }
    
    // Update ability cast preview when units are selected and dragging
    if (touchState.isDragging && state.selectedUnits.size > 0 && !touchState.touchedBase && !touchState.touchedMovementDot) {
      updateAbilityCastPreview(state, dx, dy, touchState.startPos);
    }
  });
}

export function handleTouchEnd(e: TouchEvent, state: GameState, canvas: HTMLCanvasElement): void {
  if (state.mode !== 'game') return;
  e.preventDefault();

  Array.from(e.changedTouches).forEach((touch) => {
    const touchState = touchStates.get(touch.identifier);
    if (!touchState) return;

    const rect = canvas.getBoundingClientRect();
    const { x, y } = transformCoordinates(touch.clientX, touch.clientY, rect);

    const dx = x - touchState.startPos.x;
    const dy = y - touchState.startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = Date.now() - touchState.startTime;

    const playerIndex = state.vsMode === 'player' && touchState.startPos.x > canvas.width / 2 ? 1 : 0;
    
    // Add visual feedback for drag if moved significantly
    if (touchState.isDragging && dist > 10) {
      addVisualFeedback(state, 'drag', touchState.startPos, { x, y });
    }

    if (touchState.selectionRect) {
      handleRectSelection(state, touchState.selectionRect, canvas, playerIndex);
    } else if (touchState.touchedMovementDot) {
      handleLaserSwipe(state, touchState.touchedMovementDot, { x: dx, y: dy });
    } else if (touchState.touchedBase && !touchState.isDragging) {
      const base = touchState.touchedBase;
      if (base.isSelected) {
        base.isSelected = false;
      } else {
        state.bases.forEach((b) => (b.isSelected = false));
        base.isSelected = true;
        state.selectedUnits.clear();
      }
    } else if (touchState.touchedBase && touchState.isDragging && dist > SWIPE_THRESHOLD_PX) {
      handleBaseSwipe(state, touchState.touchedBase, { x: dx, y: dy }, playerIndex);
    } else if (touchState.isDragging && dist > SWIPE_THRESHOLD_PX) {
      const selectedBase = getSelectedBase(state, playerIndex);

      // Allow swipe-to-spawn anywhere when the player's base is selected (but no units selected)
      if (selectedBase && state.selectedUnits.size === 0) {
        handleBaseSwipe(state, selectedBase, { x: dx, y: dy }, playerIndex);
      } else if (state.selectedUnits.size > 0 && !touchState.touchedBase && !touchState.touchedMovementDot) {
        // Handle ability drag for selected units
        const dragVectorPixels = { x: dx, y: dy };
        let dragVectorWorld = {
          x: dragVectorPixels.x / PIXELS_PER_METER,
          y: dragVectorPixels.y / PIXELS_PER_METER
        };
        
        // Apply mirroring if the setting is enabled (mirror both X and Y)
        if (state.settings.mirrorAbilityCasting) {
          dragVectorWorld = {
            x: -dragVectorWorld.x,
            y: -dragVectorWorld.y
          };
        }

        if (distance({ x: 0, y: 0 }, dragVectorWorld) > 0.5) {
          handleVectorBasedAbilityDrag(state, dragVectorWorld);
        } else {
          // Clear preview if drag was too short
          delete state.abilityCastPreview;
        }
      } else {
        // Clear preview if no valid action was taken in this branch
        delete state.abilityCastPreview;
      }
    } else if (elapsed < TAP_TIME_MS && dist < 10) {
      handleTap(state, { x, y }, canvas, playerIndex);
    } else {
      // Clear preview if no valid action was taken
      delete state.abilityCastPreview;
    }

    touchStates.delete(touch.identifier);
  });
}

function findTouchedBase(state: GameState, worldPos: { x: number; y: number }, playerIndex: number): Base | undefined {
  return state.bases.find((base) => {
    if (base.owner !== playerIndex) return false;
    const dist = distance(base.position, worldPos);
    return dist < BASE_SIZE_METERS / 2;
  });
}

// Helper to find the currently selected base for a given player
function getSelectedBase(state: GameState, playerIndex: number): Base | undefined {
  return state.bases.find((base) => base.owner === playerIndex && base.isSelected);
}

function findTouchedMovementDot(
  state: GameState,
  worldPos: { x: number; y: number },
  playerIndex: number
): { base: Base; dotPos: { x: number; y: number } } | undefined {
  for (const base of state.bases) {
    if (base.owner !== playerIndex || !base.isSelected || !base.movementTarget) continue;
    const dist = distance(base.movementTarget, worldPos);
    if (dist < 0.5) {
      return { base, dotPos: base.movementTarget };
    }
  }
  return undefined;
}

function handleRectSelection(
  state: GameState,
  rect: { x1: number; y1: number; x2: number; y2: number },
  canvas: HTMLCanvasElement,
  playerIndex: number
): void {
  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);

  const prevSize = state.selectedUnits.size;
  state.selectedUnits.clear();
  state.bases.forEach((b) => (b.isSelected = false));

  state.units.forEach((unit) => {
    if (unit.owner !== playerIndex) return;
    const screenPos = positionToPixels(unit.position);
    if (screenPos.x >= minX && screenPos.x <= maxX && screenPos.y >= minY && screenPos.y <= maxY) {
      state.selectedUnits.add(unit.id);
    }
  });

  if (state.selectedUnits.size > 0 && state.selectedUnits.size !== prevSize) {
    soundManager.playUnitSelect();
    return;
  }

  const selectedBase = state.bases.find((base) => {
    if (base.owner !== playerIndex) return false;
    const screenPos = positionToPixels(base.position);
    return screenPos.x >= minX && screenPos.x <= maxX && screenPos.y >= minY && screenPos.y <= maxY;
  });

  // Only select the base if no units were captured by the selection rectangle
  if (selectedBase) {
    selectedBase.isSelected = true;
    soundManager.playUnitSelect();
  }
}

function handleLaserSwipe(
  state: GameState,
  touchedDot: { base: Base; dotPos: { x: number; y: number } },
  swipe: { x: number; y: number }
): void {
  const { base } = touchedDot;

  if (base.laserCooldown > 0) return;

  const swipeLen = Math.sqrt(swipe.x * swipe.x + swipe.y * swipe.y);
  if (swipeLen < SWIPE_THRESHOLD_PX) return;

  const swipeDir = normalize({ x: swipe.x, y: -swipe.y });

  soundManager.playLaserFire();
  fireLaser(state, base, swipeDir);
  base.laserCooldown = LASER_COOLDOWN;
  
  // Send laser command to multiplayer backend for online games
  if (state.vsMode === 'online' && state.multiplayerManager) {
    sendBaseLaserCommand(state.multiplayerManager, base.id, swipeDir).catch(err => 
      console.warn('Failed to send laser command:', err)
    );
  }
}

function fireLaser(state: GameState, base: Base, direction: { x: number; y: number }): void {
  const laserEnd = add(base.position, scale(direction, LASER_RANGE));
  
  // Create visual laser beam effect
  base.laserBeam = {
    endTime: Date.now() + 500, // 0.5 second beam duration
    direction: { ...direction },
  };

  // Create laser particle effects
  const laserColor = 'oklch(0.70 0.30 320)';
  createLaserParticles(state, base.position, direction, LASER_RANGE, laserColor);

  state.units.forEach((unit) => {
    if (unit.owner === base.owner) return;

    const toUnit = subtract(unit.position, base.position);
    const projectedDist = toUnit.x * direction.x + toUnit.y * direction.y;
    const perpDist = Math.abs(toUnit.x * direction.y - toUnit.y * direction.x);

    if (projectedDist > 0 && projectedDist < LASER_RANGE && perpDist < LASER_WIDTH / 2) {
      unit.hp -= LASER_DAMAGE_UNIT;
    }
  });

  state.bases.forEach((targetBase) => {
    if (targetBase.owner === base.owner) return;

    const toBase = subtract(targetBase.position, base.position);
    const projectedDist = toBase.x * direction.x + toBase.y * direction.y;
    const perpDist = Math.abs(toBase.x * direction.y - toBase.y * direction.x);

    const baseRadius = BASE_SIZE_METERS / 2;
    if (projectedDist > 0 && projectedDist < LASER_RANGE && perpDist < LASER_WIDTH / 2 + baseRadius) {
      targetBase.hp -= LASER_DAMAGE_BASE;
    }
  });
}

function handleBaseSwipe(state: GameState, base: Base, swipe: { x: number; y: number }, playerIndex: number): void {
  const swipeLen = Math.sqrt(swipe.x * swipe.x + swipe.y * swipe.y);
  if (swipeLen < SWIPE_THRESHOLD_PX) return;

  const angle = Math.atan2(-swipe.y, swipe.x);
  const angleDeg = (angle * 180) / Math.PI;

  let spawnType: UnitType | null = null;
  let rallyOffset = { x: 0, y: 0 };

  if (angleDeg >= -45 && angleDeg < 45) {
    spawnType = state.settings.unitSlots.right;
    rallyOffset = { x: 8, y: 0 };
  } else if (angleDeg >= 45 && angleDeg < 135) {
    spawnType = state.settings.unitSlots.up;
    rallyOffset = { x: 0, y: -8 };
  } else if (angleDeg < -45 && angleDeg >= -135) {
    spawnType = state.settings.unitSlots.down;
    rallyOffset = { x: 0, y: 8 };
  } else {
    spawnType = state.settings.unitSlots.left;
    rallyOffset = { x: -8, y: 0 };
  }

  const rallyPos = add(base.position, rallyOffset);
  if (spawnType) {
    const success = spawnUnit(state, playerIndex, spawnType, base.position, rallyPos);
    if (!success) {
      soundManager.playError();
    } else if (state.vsMode === 'online' && state.multiplayerManager) {
      // Send spawn command to multiplayer backend
      sendSpawnCommand(state.multiplayerManager, playerIndex, spawnType, base.id, rallyPos).catch(err => 
        console.warn('Failed to send spawn command:', err)
      );
    }
  }
}

// Check if this is a double-tap and handle it
function isDoubleTap(state: GameState, screenPos: { x: number; y: number }): boolean {
  const now = Date.now();
  
  if (state.lastTapPosition && state.lastTapTime) {
    const dx = screenPos.x - state.lastTapPosition.x;
    const dy = screenPos.y - state.lastTapPosition.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const timeSinceLastTap = now - state.lastTapTime;
    
    if (timeSinceLastTap < DOUBLE_TAP_TIME_MS && dist < DOUBLE_TAP_DISTANCE_PX) {
      // Reset double-tap tracking
      state.lastTapTime = undefined;
      state.lastTapPosition = undefined;
      return true;
    }
  }
  
  // Update last tap tracking
  state.lastTapTime = now;
  state.lastTapPosition = { x: screenPos.x, y: screenPos.y };
  return false;
}

// Handle double-tap: deselect all units and remove last move command
function handleDoubleTap(state: GameState): void {
  // Remove the last move command from all selected units
  state.units.forEach((unit) => {
    if (state.selectedUnits.has(unit.id) && unit.commandQueue.length > 0) {
      // Find and remove the last move command
      for (let i = unit.commandQueue.length - 1; i >= 0; i--) {
        if (unit.commandQueue[i].type === 'move') {
          unit.commandQueue.splice(i, 1);
          break;
        }
      }
    }
  });
  
  // Deselect all units and bases
  state.selectedUnits.clear();
  state.bases.forEach((b) => (b.isSelected = false));
  
  soundManager.playUnitSelect(); // Play feedback sound
}

function handleTap(state: GameState, screenPos: { x: number; y: number }, canvas: HTMLCanvasElement, playerIndex: number): void {
  // Check for double-tap first
  if (isDoubleTap(state, screenPos)) {
    handleDoubleTap(state);
    return;
  }
  
  const worldPos = pixelsToPosition(screenPos);

  const tappedUnit = state.units.find((unit) => {
    if (unit.owner !== playerIndex) return false;
    return distance(unit.position, worldPos) < UNIT_SIZE_METERS / 2;
  });

  if (tappedUnit) {
    state.selectedUnits.clear();
    state.selectedUnits.add(tappedUnit.id);
    state.bases.forEach((b) => (b.isSelected = false));
    soundManager.playUnitSelect();
    return;
  }

  const selectedBase = state.bases.find((b) => b.isSelected && b.owner === playerIndex);
  if (selectedBase) {
    selectedBase.movementTarget = worldPos;
    soundManager.playUnitMove();
    
    // Send base move command to multiplayer backend for online games
    if (state.vsMode === 'online' && state.multiplayerManager) {
      sendBaseMoveCommand(state.multiplayerManager, selectedBase.id, worldPos).catch(err => 
        console.warn('Failed to send base move command:', err)
      );
    }
    return;
  }

  if (state.selectedUnits.size > 0) {
    addMovementCommand(state, worldPos, state.patrolMode);
    soundManager.playUnitMove();
    // Show toast if patrol mode is active
    if (state.patrolMode) {
      // Toast will be handled by the sound feedback
    }
  }
}

function handleAbilityDrag(state: GameState, dragVector: { x: number; y: number }, worldStart: { x: number; y: number }): void {
  const dragLen = distance({ x: 0, y: 0 }, dragVector);
  const clampedLen = Math.min(dragLen, ABILITY_MAX_RANGE);
  const direction = normalize(dragVector);
  const clampedVector = scale(direction, clampedLen);

  state.units.forEach((unit) => {
    if (!state.selectedUnits.has(unit.id)) return;
    
    // Check if unit's ability is on cooldown - can only queue if cooldown is 0
    if (unit.abilityCooldown > 0) return;

    // Use the command origin helper for consistency (last movement node)
    const startPosition = getCommandOrigin(unit);

    // Ability should be cast from startPosition, not from a far position
    // The direction vector already indicates where the ability aims
    const abilityNode: CommandNode = { type: 'ability', position: startPosition, direction: clampedVector };

    // In chess mode, add to pending commands instead of immediate queue
    if (state.settings.chessMode && state.chessMode) {
      // Store only the latest command for this unit (overwrite previous)
      state.chessMode.pendingCommands.set(unit.id, [abilityNode]);
    } else {
      // Normal RTS mode: add to queue immediately
      if (unit.commandQueue.length >= QUEUE_MAX_LENGTH) return;
      
      // Check if there's already an ability queued anywhere in the command queue
      const hasQueuedAbility = unit.commandQueue.some(node => node.type === 'ability');
      if (hasQueuedAbility) {
        return;
      }
      
      unit.commandQueue.push(abilityNode);
    }
  });
  
  // Clear the ability cast preview after executing the command
  delete state.abilityCastPreview;
}

// Helper function to get the command origin for a unit (last queued position or current position)
function getCommandOrigin(unit: Unit): Vector2 {
  for (let i = unit.commandQueue.length - 1; i >= 0; i--) {
    const node = unit.commandQueue[i];
    if (node.type === 'move' || node.type === 'attack-move') {
      return node.position;
    }
  }
  return unit.position;
}

// Helper function to clamp a vector to max range
function clampVectorToRange(vector: Vector2, maxRange: number): Vector2 {
  const len = distance({ x: 0, y: 0 }, vector);
  const clampedLen = Math.min(len, maxRange);
  const direction = normalize(vector); // normalize() already handles zero-length vectors
  return scale(direction, clampedLen);
}

// Helper function to update the ability cast preview during drag
function updateAbilityCastPreview(state: GameState, screenDx: number, screenDy: number, screenStartPos: { x: number; y: number }): void {
  // Get the first selected unit to determine the command origin
  const selectedUnit = state.units.find(unit => state.selectedUnits.has(unit.id));
  if (!selectedUnit) {
    delete state.abilityCastPreview;
    return;
  }
  
  const commandOrigin = getCommandOrigin(selectedUnit);
  
  // Convert screen drag distance to world space vector
  const dragVectorPixels = { x: screenDx, y: screenDy };
  let dragVectorWorld = {
    x: dragVectorPixels.x / PIXELS_PER_METER,
    y: dragVectorPixels.y / PIXELS_PER_METER
  };
  
  // Apply mirroring if the setting is enabled (mirror both X and Y)
  if (state.settings.mirrorAbilityCasting) {
    dragVectorWorld = {
      x: -dragVectorWorld.x,
      y: -dragVectorWorld.y
    };
  }
  
  // Clamp to max range
  const clampedVector = clampVectorToRange(dragVectorWorld, ABILITY_MAX_RANGE);
  
  state.abilityCastPreview = {
    commandOrigin,
    dragVector: clampedVector,
    screenStartPos: pixelsToPosition(screenStartPos)
  };
}

// Helper function to execute ability drag from vector-based input
function handleVectorBasedAbilityDrag(state: GameState, dragVector: { x: number; y: number }): void {
  const clampedVector = clampVectorToRange(dragVector, ABILITY_MAX_RANGE);
  
  const selectedUnitsArray = state.units.filter(unit => state.selectedUnits.has(unit.id));

  // Apply ability command to all selected units
  selectedUnitsArray.forEach((unit) => {
    // Check if unit's ability is on cooldown - can only queue if cooldown is 0
    if (unit.abilityCooldown > 0) return;

    // Use the command origin (last movement node or current position)
    const startPosition = getCommandOrigin(unit);

    // Ability should be cast from startPosition, not from a far position
    // The direction vector already indicates where the ability aims
    const abilityNode: CommandNode = { type: 'ability', position: startPosition, direction: clampedVector };

    // In chess mode, add to pending commands instead of immediate queue
    if (state.settings.chessMode && state.chessMode) {
      // Store only the latest command for this unit (overwrite previous)
      state.chessMode.pendingCommands.set(unit.id, [abilityNode]);
    } else {
      // Normal RTS mode: add to queue immediately
      if (unit.commandQueue.length >= QUEUE_MAX_LENGTH) return;
      
      // Check if there's already an ability queued anywhere in the command queue
      const hasQueuedAbility = unit.commandQueue.some(node => node.type === 'ability');
      if (hasQueuedAbility) {
        return;
      }
      
      unit.commandQueue.push(abilityNode);
      
      // Start draw animation for new command
      startQueueDrawAnimation(unit);
    }
  });
  
  // Send command to multiplayer backend for online games
  if (state.vsMode === 'online' && state.multiplayerManager && selectedUnitsArray.length > 0) {
    const unitIds = selectedUnitsArray.map(u => u.id);
    const firstUnit = selectedUnitsArray[0];
    const startPosition = getCommandOrigin(firstUnit);
    sendAbilityCommand(state.multiplayerManager, unitIds, startPosition, clampedVector).catch(err => 
      console.warn('Failed to send ability command:', err)
    );
  }
  
  // Clear the ability cast preview after executing the command
  delete state.abilityCastPreview;
}

// Helper function to get return position for patrol commands
function getPatrolReturnPosition(unit: Unit): Vector2 {
  // Use current position or last queued position as return point
  if (unit.commandQueue.length > 0) {
    const lastNode = unit.commandQueue[unit.commandQueue.length - 1];
    if (lastNode.type === 'move' || lastNode.type === 'attack-move' || lastNode.type === 'patrol') {
      return lastNode.position;
    }
  }
  return unit.position;
}

// Helper function to start queue draw animation
function startQueueDrawAnimation(unit: Unit): void {
  unit.queueDrawStartTime = Date.now();
  unit.queueDrawReverse = false;
}

function addMovementCommand(state: GameState, worldPos: { x: number; y: number }, isPatrol: boolean = false): void {
  const selectedUnitsArray = state.units.filter(unit => state.selectedUnits.has(unit.id));
  
  if (selectedUnitsArray.length === 0) return;
  
  // Always apply formation logic to ensure proper spacing
  // Even with 'none' formation, units will be spaced apart to prevent stacking
  const spacing = 1.0; // 1 meter spacing as per requirements
  const formationPositions = applyFormation(
    selectedUnitsArray,
    worldPos,
    state.currentFormation || 'none',
    spacing
  );
  
  // Assign formation positions to units
  selectedUnitsArray.forEach((unit, index) => {
    // In chess mode, add to pending commands instead of immediate queue
    if (state.settings.chessMode && state.chessMode) {
      const command: CommandNode = isPatrol 
        ? { type: 'patrol', position: formationPositions[index], returnPosition: getPatrolReturnPosition(unit) }
        : { type: 'move', position: formationPositions[index] };
      
      // Store only the latest command for this unit (overwrite previous)
      state.chessMode.pendingCommands.set(unit.id, [command]);
    } else {
      // Normal RTS mode: add to queue immediately
      if (unit.commandQueue.length >= QUEUE_MAX_LENGTH) return;
      
      if (isPatrol) {
        const returnPos = getPatrolReturnPosition(unit);
        unit.commandQueue.push({ type: 'patrol', position: formationPositions[index], returnPosition: returnPos });
      } else {
        unit.commandQueue.push({ type: 'move', position: formationPositions[index] });
      }
      
      // Start draw animation for new command
      startQueueDrawAnimation(unit);
    }
  });
  
  // Send command to multiplayer backend for online games
  if (state.vsMode === 'online' && state.multiplayerManager) {
    const unitIds = selectedUnitsArray.map(u => u.id);
    sendMoveCommand(state.multiplayerManager, unitIds, worldPos, false).catch(err => 
      console.warn('Failed to send move command:', err)
    );
  }
}

export function handleMouseDown(e: MouseEvent, state: GameState, canvas: HTMLCanvasElement): void {
  if (state.mode !== 'game') return;
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const { x, y } = transformCoordinates(e.clientX, e.clientY, rect);
  const worldPos = pixelsToPosition({ x, y });
  
  // Add visual feedback for mouse down
  addVisualFeedback(state, 'tap', { x, y });

  const playerIndex = state.vsMode === 'player' && x > canvas.width / 2 ? 1 : 0;

  const touchedBase = findTouchedBase(state, worldPos, playerIndex);
  const touchedDot = findTouchedMovementDot(state, worldPos, playerIndex);

  mouseState = {
    startPos: { x, y },
    startTime: Date.now(),
    isDragging: false,
    selectedUnitsSnapshot: new Set(state.selectedUnits),
    touchedBase,
    touchedMovementDot: touchedDot,
  };
}

export function handleMouseMove(e: MouseEvent, state: GameState, canvas: HTMLCanvasElement): void {
  if (state.mode !== 'game') return;
  
  const rect = canvas.getBoundingClientRect();
  const { x, y } = transformCoordinates(e.clientX, e.clientY, rect);
  
  // Update tooltip if not dragging
  if (!mouseState || !mouseState.isDragging) {
    const worldPos = pixelsToPosition({ x, y });
    
    // Check for unit hover
    const hoveredUnit = state.units.find(unit => {
      if (unit.owner !== 0) return false; // Only show tooltips for player units
      const dist = distance(worldPos, unit.position);
      return dist < 0.8; // Within unit radius
    });
    
    if (hoveredUnit) {
      const def = UNIT_DEFINITIONS[hoveredUnit.type];
      state.tooltip = {
        text: [
          `${def.name}`,
          `HP: ${Math.ceil(hoveredUnit.hp)}/${def.hp}`,
          `Dmg: ${Math.ceil(def.damage * hoveredUnit.damageMultiplier)}`,
          `Ability: ${def.ability}`,
          hoveredUnit.abilityCooldown > 0 
            ? `Cooldown: ${hoveredUnit.abilityCooldown.toFixed(1)}s`
            : 'Ready',
        ],
        position: worldPos,
        visible: true,
      };
    } else {
      state.tooltip = { text: [], position: { x: 0, y: 0 }, visible: false };
    }
  }
  
  if (!mouseState) return;
  e.preventDefault();

  const dx = x - mouseState.startPos.x;
  const dy = y - mouseState.startPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 10 && !mouseState.isDragging) {
    mouseState.isDragging = true;

    // Only create selection rect if no units are selected AND no base touched
    const playerIndex = state.vsMode === 'player' && mouseState.startPos.x > canvas.width / 2 ? 1 : 0;
    const selectedBase = getSelectedBase(state, playerIndex);

    // Skip selection rects when the base is selected so swipes spawn units anywhere
    if (!mouseState.touchedBase && state.selectedUnits.size === 0 && !selectedBase) {
      mouseState.selectionRect = {
        x1: mouseState.startPos.x,
        y1: mouseState.startPos.y,
        x2: x,
        y2: y,
      };
    }
  }

  if (mouseState.selectionRect) {
    mouseState.selectionRect.x2 = x;
    mouseState.selectionRect.y2 = y;
  }
  
  // Update ability cast preview when units are selected and dragging
  if (mouseState.isDragging && state.selectedUnits.size > 0 && !mouseState.touchedBase && !mouseState.touchedMovementDot) {
    updateAbilityCastPreview(state, dx, dy, mouseState.startPos);
  }
}

export function handleMouseUp(e: MouseEvent, state: GameState, canvas: HTMLCanvasElement): void {
  if (state.mode !== 'game') return;
  if (!mouseState) return;
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const { x, y } = transformCoordinates(e.clientX, e.clientY, rect);

  const dx = x - mouseState.startPos.x;
  const dy = y - mouseState.startPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const elapsed = Date.now() - mouseState.startTime;

  const playerIndex = state.vsMode === 'player' && mouseState.startPos.x > canvas.width / 2 ? 1 : 0;
  
  // Add visual feedback for drag if moved significantly
  if (mouseState.isDragging && dist > 10) {
    addVisualFeedback(state, 'drag', mouseState.startPos, { x, y });
  }

  if (mouseState.selectionRect) {
    handleRectSelection(state, mouseState.selectionRect, canvas, playerIndex);
  } else if (mouseState.touchedMovementDot) {
    handleLaserSwipe(state, mouseState.touchedMovementDot, { x: dx, y: dy });
  } else if (mouseState.touchedBase && !mouseState.isDragging) {
    const base = mouseState.touchedBase;
    if (base.isSelected) {
      base.isSelected = false;
    } else {
      state.bases.forEach((b) => (b.isSelected = false));
      base.isSelected = true;
      state.selectedUnits.clear();
    }
  } else if (mouseState.touchedBase && mouseState.isDragging && dist > SWIPE_THRESHOLD_PX) {
    handleBaseSwipe(state, mouseState.touchedBase, { x: dx, y: dy }, playerIndex);
  } else if (mouseState.isDragging && dist > SWIPE_THRESHOLD_PX) {
    const selectedBase = getSelectedBase(state, playerIndex);

    // Allow swipe-to-spawn anywhere when the player's base is selected
    if (selectedBase && state.selectedUnits.size === 0) {
      handleBaseSwipe(state, selectedBase, { x: dx, y: dy }, playerIndex);
    }
  } else if (elapsed < TAP_TIME_MS && dist < 10) {
    handleTap(state, { x, y }, canvas, playerIndex);
  } else if (mouseState.isDragging && state.selectedUnits.size > 0 && !mouseState.touchedBase && !mouseState.touchedMovementDot) {
    // Use vector-based ability drag: convert screen drag to world vector
    const dragVectorPixels = { x: dx, y: dy };
    let dragVectorWorld = {
      x: dragVectorPixels.x / PIXELS_PER_METER,
      y: dragVectorPixels.y / PIXELS_PER_METER
    };
    
    // Apply mirroring if the setting is enabled (mirror both X and Y)
    if (state.settings.mirrorAbilityCasting) {
      dragVectorWorld = {
        x: -dragVectorWorld.x,
        y: -dragVectorWorld.y
      };
    }

    if (distance({ x: 0, y: 0 }, dragVectorWorld) > 0.5) {
      handleVectorBasedAbilityDrag(state, dragVectorWorld);
    } else {
      // Clear preview if drag was too short
      delete state.abilityCastPreview;
    }
  } else {
    // Clear preview if no valid action was taken
    delete state.abilityCastPreview;
  }

  mouseState = null;
}

export function getActiveSelectionRect(): { x1: number; y1: number; x2: number; y2: number } | null {
  if (mouseState?.selectionRect) {
    return mouseState.selectionRect;
  }
  
  for (const touchState of touchStates.values()) {
    if (touchState.selectionRect) {
      return touchState.selectionRect;
    }
  }
  
  return null;
}
