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
} from './types';
import { distance, normalize, scale, add, subtract, pixelsToPosition, positionToPixels } from './gameUtils';
import { spawnUnit } from './simulation';
import { soundManager } from './sound';

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
      // Create selection rect if: no base touched AND (no units selected OR held long enough)
      if (!touchState.touchedBase && (state.selectedUnits.size === 0 || elapsed > HOLD_TIME_MS)) {
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
    } else if (elapsed < TAP_TIME_MS && dist < 10) {
      handleTap(state, { x, y }, canvas, playerIndex);
    } else if (touchState.isDragging && state.selectedUnits.size > 0) {
      const worldStart = pixelsToPosition(touchState.startPos);
      const worldEnd = pixelsToPosition({ x, y });
      const dragVector = subtract(worldEnd, worldStart);

      if (distance({ x: 0, y: 0 }, dragVector) > 0.5) {
        handleAbilityDrag(state, dragVector, worldStart);
      }
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
}

function fireLaser(state: GameState, base: Base, direction: { x: number; y: number }): void {
  const laserEnd = add(base.position, scale(direction, LASER_RANGE));
  
  // Create visual laser beam effect
  base.laserBeam = {
    endTime: Date.now() + 500, // 0.5 second beam duration
    direction: { ...direction },
  };

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
  if (base.isSelected) return;

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
    return;
  }

  if (state.selectedUnits.size > 0) {
    addMovementCommand(state, worldPos);
    soundManager.playUnitMove();
  }
}

function handleAbilityDrag(state: GameState, dragVector: { x: number; y: number }, worldStart: { x: number; y: number }): void {
  const dragLen = distance({ x: 0, y: 0 }, dragVector);
  const clampedLen = Math.min(dragLen, ABILITY_MAX_RANGE);
  const direction = normalize(dragVector);
  const clampedVector = scale(direction, clampedLen);

  state.units.forEach((unit) => {
    if (!state.selectedUnits.has(unit.id)) return;
    if (unit.commandQueue.length >= QUEUE_MAX_LENGTH) return;

    // Find the last move command in the queue to use as the starting point
    let startPosition = unit.position;
    for (let i = unit.commandQueue.length - 1; i >= 0; i--) {
      const node = unit.commandQueue[i];
      if (node.type === 'move' || node.type === 'attack-move') {
        startPosition = node.position;
        break;
      }
    }

    const abilityPos = add(startPosition, clampedVector);

    const pathToAbility: CommandNode = { type: 'move', position: abilityPos };
    const abilityNode: CommandNode = { type: 'ability', position: abilityPos, direction: clampedVector };

    if (unit.commandQueue.length === 0 || unit.commandQueue[unit.commandQueue.length - 1].type === 'ability') {
      unit.commandQueue.push(pathToAbility);
    }

    unit.commandQueue.push(abilityNode);
  });
}

function addMovementCommand(state: GameState, worldPos: { x: number; y: number }): void {
  state.units.forEach((unit) => {
    if (!state.selectedUnits.has(unit.id)) return;
    if (unit.commandQueue.length >= QUEUE_MAX_LENGTH) return;

    unit.commandQueue.push({ type: 'move', position: worldPos });
  });
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

    if (!mouseState.touchedBase) {
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
  } else if (elapsed < TAP_TIME_MS && dist < 10) {
    handleTap(state, { x, y }, canvas, playerIndex);
  } else if (mouseState.isDragging && state.selectedUnits.size > 0) {
    const worldStart = pixelsToPosition(mouseState.startPos);
    const worldEnd = pixelsToPosition({ x, y });
    const dragVector = subtract(worldEnd, worldStart);

    if (distance({ x: 0, y: 0 }, dragVector) > 0.5) {
      handleAbilityDrag(state, dragVector, worldStart);
    }
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
