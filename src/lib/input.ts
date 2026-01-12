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
  MINING_DEPOT_SIZE_METERS,
  MINING_DRONE_SIZE_MULTIPLIER,
  UNIT_DEFINITIONS,
  STRUCTURE_DEFINITIONS,
  Vector2,
  PIXELS_PER_METER,
} from './types';
import { distance, normalize, scale, add, subtract, pixelsToPosition, positionToPixels, getViewportOffset, getViewportDimensions, generateId, isVisibleToPlayer, getViewportScale } from './gameUtils';
import { screenToWorld, worldToScreen, zoomCamera, initializeCamera } from './camera';
import { spawnUnit } from './simulation';
import { soundManager } from './sound';
import { applyFormation } from './formations';
import { createLaserParticles, createEnergyPulse, createSpawnEffect } from './visualEffects';
import { sendMoveCommand, sendAbilityCommand, sendBaseMoveCommand, sendBaseLaserCommand, sendSpawnCommand } from './multiplayerGame';

interface TouchState {
  startPos: { x: number; y: number };
  startTime: number;
  isDragging: boolean;
  selectedUnitsSnapshot: Set<string>;
  selectionRect?: { x1: number; y1: number; x2: number; y2: number };
  touchedBase?: Base;
  touchedBaseWasSelected?: boolean; // Track if the touched base was already selected
  touchedMovementDot?: { base: Base; dotPos: { x: number; y: number } };
  touchedDepot?: import('./types').MiningDepot; // Track if touched a mining depot
  touchedDepotPos?: Vector2; // World position where depot was touched
}

const touchStates = new Map<number, TouchState>();
let mouseState: TouchState | null = null;
let pinchState: { lastDistance: number; lastCenter: { x: number; y: number } } | null = null;

const SWIPE_THRESHOLD_PX = 30;
const TAP_TIME_MS = 300;
const HOLD_TIME_MS = 200;
const DOUBLE_TAP_TIME_MS = 400; // Time window for double-tap detection
const DOUBLE_TAP_DISTANCE_PX = 50; // Max distance between taps to count as double-tap
// Use the depot footprint so canceling feels consistent with the larger mining hub.
const MINING_DEPOT_CANCEL_RADIUS = MINING_DEPOT_SIZE_METERS * 0.5;

function addVisualFeedback(
  state: GameState,
  canvas: HTMLCanvasElement,
  type: 'tap' | 'drag',
  position: { x: number; y: number },
  endPosition?: { x: number; y: number }
): void {
  if (!state.visualFeedback) {
    state.visualFeedback = [];
  }
  
  const worldPos = screenToWorldPosition(state, canvas, position);
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
    feedback.endPosition = screenToWorldPosition(state, canvas, endPosition);
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

// Convert screen pixels to world coordinates while respecting camera zoom/pan
function screenToWorldPosition(state: GameState, canvas: HTMLCanvasElement, screenPos: Vector2): Vector2 {
  const worldPixels = screenToWorld(screenPos, state, canvas);
  return pixelsToPosition(worldPixels);
}

// Convert world coordinates to screen pixels while respecting camera zoom/pan
function worldToScreenPosition(state: GameState, canvas: HTMLCanvasElement, worldPos: Vector2): Vector2 {
  const baseScreenPos = positionToPixels(worldPos);
  
  if (!state.camera) {
    return baseScreenPos;
  }
  
  return worldToScreen(baseScreenPos, state, canvas);
}

// Calculate the distance between two touches in screen space for pinch zooming
function getPinchDistance(touches: TouchList, rect: DOMRect): number {
  if (touches.length < 2) {
    return 0;
  }
  
  const [firstTouch, secondTouch] = [touches[0], touches[1]];
  const firstPos = transformCoordinates(firstTouch.clientX, firstTouch.clientY, rect);
  const secondPos = transformCoordinates(secondTouch.clientX, secondTouch.clientY, rect);
  return Math.hypot(secondPos.x - firstPos.x, secondPos.y - firstPos.y);
}

// Calculate the center point between two touches in screen space
function getTouchCenter(touches: TouchList, rect: DOMRect): { x: number; y: number } {
  if (touches.length < 2) {
    return { x: 0, y: 0 };
  }
  
  const [firstTouch, secondTouch] = [touches[0], touches[1]];
  const firstPos = transformCoordinates(firstTouch.clientX, firstTouch.clientY, rect);
  const secondPos = transformCoordinates(secondTouch.clientX, secondTouch.clientY, rect);
  return {
    x: (firstPos.x + secondPos.x) / 2,
    y: (firstPos.y + secondPos.y) / 2
  };
}

function getViewportCenterX(): number {
  // Center split should match the letterboxed arena viewport
  const viewportOffset = getViewportOffset();
  const viewportDimensions = getViewportDimensions();
  const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth : viewportDimensions.width;
  return viewportDimensions.width > 0
    ? viewportOffset.x + viewportDimensions.width / 2
    : fallbackWidth / 2;
}

function resolvePlayerIndex(state: GameState, screenX: number): number {
  // In local vs mode, determine player side based on arena viewport center
  if (state.vsMode !== 'player') {
    return 0;
  }
  
  return screenX > getViewportCenterX() ? 1 : 0;
}

export function handleTouchStart(e: TouchEvent, state: GameState, canvas: HTMLCanvasElement): void {
  if (state.mode !== 'game') return;
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();

  Array.from(e.changedTouches).forEach((touch) => {
    const { x, y } = transformCoordinates(touch.clientX, touch.clientY, rect);
    const worldPos = screenToWorldPosition(state, canvas, { x, y });
    
    // Add visual feedback for touch start
    addVisualFeedback(state, canvas, 'tap', { x, y });

    const playerIndex = resolvePlayerIndex(state, x);

    const touchedBase = findTouchedBase(state, worldPos, playerIndex);
    const touchedDot = findTouchedMovementDot(state, worldPos, playerIndex);
    const touchedDepot = findTouchedMiningDepot(state, worldPos, playerIndex);

    touchStates.set(touch.identifier, {
      startPos: { x, y },
      startTime: Date.now(),
      isDragging: false,
      selectedUnitsSnapshot: new Set(state.selectedUnits),
      touchedBase,
      touchedBaseWasSelected: touchedBase?.isSelected || false,
      touchedMovementDot: touchedDot,
      touchedDepot,
      touchedDepotPos: touchedDepot ? worldPos : undefined,
    });
  });
  
  // Initialize pinch tracking when a second touch begins
  if (e.touches.length >= 2) {
    const center = getTouchCenter(e.touches, rect);
    pinchState = { 
      lastDistance: getPinchDistance(e.touches, rect),
      lastCenter: center
    };
  }
}

export function handleTouchMove(e: TouchEvent, state: GameState, canvas: HTMLCanvasElement): void {
  if (state.mode !== 'game') return;
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();

  // Handle pinch-to-zoom and two-finger pan when two fingers are active
  if (e.touches.length >= 2) {
    const pinchDistance = getPinchDistance(e.touches, rect);
    const center = getTouchCenter(e.touches, rect);
    
    if (!pinchState) {
      pinchState = { 
        lastDistance: pinchDistance,
        lastCenter: center
      };
    } else {
      // Handle pinch-to-zoom
      const distanceDelta = pinchDistance - pinchState.lastDistance;
      const zoomDelta = distanceDelta / 120;
      
      if (Math.abs(zoomDelta) > 0.01) {
        zoomCamera(state, zoomDelta);
      }
      
      // Handle two-finger pan
      const centerDelta = {
        x: center.x - pinchState.lastCenter.x,
        y: center.y - pinchState.lastCenter.y
      };
      
      // Pan the camera based on finger movement
      // Inverted: camera moves in the same direction as finger movement (intuitive dragging)
      if (Math.abs(centerDelta.x) > 1 || Math.abs(centerDelta.y) > 1) {
        if (!state.camera) {
          initializeCamera(state);
        }
        
        if (state.camera) {
          // Convert screen pixel delta to world meters, accounting for zoom
          // Divide by PIXELS_PER_METER and viewport scale, then by zoom to get world space delta
          // Positive (inverted) so camera moves with finger direction (intuitive dragging)
          const viewportScale = getViewportScale();
          const zoom = state.camera.zoom || 1.0;
          
          state.camera.targetOffset.x += (centerDelta.x / (PIXELS_PER_METER * viewportScale * zoom));
          state.camera.targetOffset.y += (centerDelta.y / (PIXELS_PER_METER * viewportScale * zoom));
        }
      }
      
      pinchState.lastDistance = pinchDistance;
      pinchState.lastCenter = center;
    }
    
    return;
  }

  Array.from(e.changedTouches).forEach((touch) => {
    const touchState = touchStates.get(touch.identifier);
    if (!touchState) return;

    const { x, y } = transformCoordinates(touch.clientX, touch.clientY, rect);

    const dx = x - touchState.startPos.x;
    const dy = y - touchState.startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 10 && !touchState.isDragging) {
      touchState.isDragging = true;

      const elapsed = Date.now() - touchState.startTime;
      // Only create selection rect if no units are selected AND no base/depot touched
      // When units are selected, dragging will be for ability casting instead
      const playerIndex = resolvePlayerIndex(state, touchState.startPos.x);
      const selectedBase = getSelectedBase(state, playerIndex);
      
      // Check if selected units are all mining drones for building menu
      const selectedUnitsList = Array.from(state.selectedUnits)
        .map(id => state.units.find(u => u.id === id))
        .filter((u): u is import('./types').Unit => u !== undefined);
      const allMiningDrones = selectedUnitsList.length > 0 && 
        selectedUnitsList.every(u => u.type === 'miningDrone' && u.owner === playerIndex);

      // Initialize building menu if holding with mining drones selected
      if (allMiningDrones && elapsed >= HOLD_TIME_MS && !state.buildingMenu && !touchState.touchedBase && !touchState.touchedDepot) {
        const worldStart = screenToWorldPosition(state, canvas, touchState.startPos);
        state.buildingMenu = {
          workerIds: Array.from(state.selectedUnits),
          startPosition: worldStart,
          currentPosition: worldStart,
          startTime: Date.now(),
        };
        soundManager.play('menu-selection');
      }

      // Skip selection rects when the base is selected so swipes spawn units anywhere
      if (!touchState.touchedBase && !touchState.touchedDepot && state.selectedUnits.size === 0 && !selectedBase) {
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
    
    // Update building menu if active
    if (state.buildingMenu) {
      const worldCurrent = screenToWorldPosition(state, canvas, { x, y });
      state.buildingMenu.currentPosition = worldCurrent;
      
      // Determine which building type based on drag direction
      const dragVector = subtract(worldCurrent, state.buildingMenu.startPosition);
      const dragDistance = distance({ x: 0, y: 0 }, dragVector);
      
      if (dragDistance > 1.5) { // Minimum drag distance to select a direction
        const angle = Math.atan2(dragVector.y, dragVector.x);
        const angleDeg = angle * (180 / Math.PI);
        
        // Determine direction: left (180°), up (-90°), right (0°), down (90°)
        // Convert angle to 0-360 range
        const normalizedAngle = ((angleDeg + 360) % 360);
        
        const playerIndex = resolvePlayerIndex(state, touchState.startPos.x);
        const playerFaction = state.settings.playerFaction;
        
        if (normalizedAngle >= 135 && normalizedAngle < 225) {
          // Left - Offensive tower
          state.buildingMenu.selectedType = 'offensive';
        } else if (normalizedAngle >= 45 && normalizedAngle < 135) {
          // Down - Cancel
          state.buildingMenu.selectedType = undefined;
        } else if (normalizedAngle >= 315 || normalizedAngle < 45) {
          // Right - Faction-specific tower
          state.buildingMenu.selectedType = `faction-${playerFaction}` as import('./types').StructureType;
        } else {
          // Up - Defensive tower
          state.buildingMenu.selectedType = 'defensive';
        }
      } else {
        state.buildingMenu.selectedType = undefined;
      }
    }
    
    // Update rally point preview when dragging from a selected base
    if (touchState.isDragging && touchState.touchedBase && touchState.touchedBaseWasSelected) {
      // Convert screen space swipe delta to world space delta properly
      const baseScreenPos = worldToScreenPosition(state, canvas, touchState.touchedBase.position);
      const swipeEndScreenPos = { x: baseScreenPos.x + dx, y: baseScreenPos.y + dy };
      const swipeEndWorldPos = screenToWorldPosition(state, canvas, swipeEndScreenPos);
      const swipeWorldDelta = subtract(swipeEndWorldPos, touchState.touchedBase.position);
      const newRallyPoint = add(touchState.touchedBase.position, swipeWorldDelta);
      
      state.rallyPointPreview = {
        baseId: touchState.touchedBase.id,
        rallyPoint: newRallyPoint
      };
    } else {
      // Clear rally point preview if not dragging from base
      delete state.rallyPointPreview;
    }
    
    // Update ability cast preview when units are selected and dragging
    if (touchState.isDragging && state.selectedUnits.size > 0 && !touchState.touchedBase && !touchState.touchedMovementDot) {
      updateAbilityCastPreview(state, dx, dy, touchState.startPos, canvas);
    }

    // Update mining depot drag preview so the line snaps toward the closest available deposit
    if (touchState.isDragging && touchState.touchedDepot && touchState.touchedDepotPos) {
      const endWorldPos = screenToWorldPosition(state, canvas, { x, y });
      const snappedDeposit = findSnappedResourceDeposit(touchState.touchedDepot, touchState.touchedDepotPos, endWorldPos);

      if (snappedDeposit) {
        state.miningDragPreview = {
          depotId: touchState.touchedDepot.id,
          depositId: snappedDeposit.id,
        };
      } else {
        delete state.miningDragPreview;
      }
    }
    
    // Update base ability preview when base is selected and dragging (but not from the base itself)
    updateBaseAbilityPreview(state, touchState.isDragging, touchState.touchedBase, touchState.startPos, dx, dy, canvas);
  });
}

export function handleTouchEnd(e: TouchEvent, state: GameState, canvas: HTMLCanvasElement): void {
  if (state.mode !== 'game') return;
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();

  Array.from(e.changedTouches).forEach((touch) => {
    const touchState = touchStates.get(touch.identifier);
    if (!touchState) return;

    const { x, y } = transformCoordinates(touch.clientX, touch.clientY, rect);

    const dx = x - touchState.startPos.x;
    const dy = y - touchState.startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = Date.now() - touchState.startTime;

    const playerIndex = resolvePlayerIndex(state, touchState.startPos.x);
    
    // Add visual feedback for drag if moved significantly
    if (touchState.isDragging && dist > 10) {
      addVisualFeedback(state, canvas, 'drag', touchState.startPos, { x, y });
    }

    if (touchState.selectionRect) {
      handleRectSelection(state, touchState.selectionRect, canvas, playerIndex);
    } else if (state.buildingMenu && state.buildingMenu.selectedType) {
      // Handle building placement
      handleBuildingPlacement(state, state.buildingMenu, playerIndex);
      delete state.buildingMenu;
    } else if (state.buildingMenu) {
      // Cancel building menu if no type selected (dragged down or too short drag)
      delete state.buildingMenu;
    } else if (touchState.touchedMovementDot) {
      handleLaserSwipe(state, touchState.touchedMovementDot, { x: dx, y: dy });
    } else if (touchState.touchedDepot && touchState.isDragging && dist > SWIPE_THRESHOLD_PX && touchState.touchedDepotPos) {
      // Handle mining depot drag to create mining drone
      const endWorldPos = screenToWorldPosition(state, canvas, { x, y });
      handleMiningDepotDrag(state, touchState.touchedDepot, touchState.touchedDepotPos, endWorldPos, playerIndex);
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
      // If base was already selected, dragging from it sets rally point
      // If base was not selected, dragging from it spawns units
      if (touchState.touchedBaseWasSelected) {
        handleSetRallyPoint(state, touchState.touchedBase, { x: dx, y: dy }, canvas);
        delete state.rallyPointPreview; // Clear preview after setting rally point
      } else if (state.settings.controlMode === 'swipe') {
        // Only spawn units via swipe in swipe mode
        handleBaseSwipe(state, touchState.touchedBase, { x: dx, y: dy }, playerIndex);
      }
    } else if (touchState.isDragging && dist > SWIPE_THRESHOLD_PX) {
      // Clear rally point preview if drag ended without setting rally point (and continuing to other actions)
      delete state.rallyPointPreview;
      
      const selectedBase = getSelectedBase(state, playerIndex);

      // When base is selected and drag is NOT from the base, queue the base's ability
      if (selectedBase && state.selectedUnits.size === 0 && !touchState.touchedBase) {
        handleBaseAbilityDrag(state, selectedBase, { x: dx, y: dy }, touchState.startPos, canvas);
      } else if (state.selectedUnits.size > 0 && !touchState.touchedBase && !touchState.touchedMovementDot) {
        // Handle ability drag for selected units
        const worldStart = screenToWorldPosition(state, canvas, touchState.startPos);
        const worldEnd = screenToWorldPosition(state, canvas, { x, y });
        let dragVectorWorld = subtract(worldEnd, worldStart);
        
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
    } else if (state.settings.controlMode === 'radial' && elapsed >= HOLD_TIME_MS && dist < 20 && !touchState.touchedBase && !touchState.touchedDepot && state.selectedUnits.size === 0) {
      // Show radial menu for long press in radial mode (not on base or depot, no units selected)
      const worldPos = screenToWorldPosition(state, canvas, { x, y });
      state.radialMenu = {
        worldPosition: worldPos,
        visible: true,
        startTime: Date.now(),
      };
    } else {
      // Clear preview if no valid action was taken
      delete state.abilityCastPreview;
    }
    
    // Clear all input-related previews when touch is released
    clearBaseAbilityPreview(state);
    delete state.miningDragPreview;

    touchStates.delete(touch.identifier);
  });
  
  if (e.touches.length < 2) {
    pinchState = null;
  }
}

function findTouchedBase(state: GameState, worldPos: { x: number; y: number }, playerIndex: number): Base | undefined {
  return state.bases.find((base) => {
    if (base.owner !== playerIndex) return false;
    const dist = distance(base.position, worldPos);
    return dist < BASE_SIZE_METERS / 2;
  });
}

function findTouchedMiningDepot(state: GameState, worldPos: { x: number; y: number }, playerIndex: number): import('./types').MiningDepot | undefined {
  const DEPOT_SIZE = MINING_DEPOT_SIZE_METERS;
  return state.miningDepots.find((depot) => {
    if (depot.owner !== playerIndex) return false;
    const dist = distance(depot.position, worldPos);
    return dist < DEPOT_SIZE / 2;
  });
}

function findSnappedResourceDeposit(
  depot: import('./types').MiningDepot,
  startWorldPos: Vector2,
  endWorldPos: Vector2
): import('./types').ResourceDeposit | undefined {
  const dragVector = subtract(endWorldPos, startWorldPos);
  const dragDistance = distance({ x: 0, y: 0 }, dragVector);

  // Ignore tiny drags so we don't snap to an arbitrary deposit
  if (dragDistance <= 0.01) {
    return undefined;
  }

  const dragDirection = normalize(dragVector);
  let bestDeposit: import('./types').ResourceDeposit | undefined;
  let bestAngle = Number.POSITIVE_INFINITY;

  depot.deposits.forEach((deposit) => {
    const workerCount = deposit.workerIds?.length ?? 0;
    if (workerCount >= 2) {
      return;
    }

    const depositDirection = normalize(subtract(deposit.position, depot.position));
    const dot = Math.max(-1, Math.min(1, dragDirection.x * depositDirection.x + dragDirection.y * depositDirection.y));
    const angle = Math.acos(dot);

    if (angle < bestAngle) {
      bestAngle = angle;
      bestDeposit = deposit;
    }
  });

  return bestDeposit;
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
    const screenPos = worldToScreenPosition(state, canvas, unit.position);
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
    const screenPos = worldToScreenPosition(state, canvas, base.position);
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

// Handle drag from anywhere (not from base) when base is selected - this queues the base's ability
function handleBaseAbilityDrag(
  state: GameState,
  base: Base,
  swipe: { x: number; y: number },
  startPos: { x: number; y: number },
  canvas: HTMLCanvasElement
): void {
  const swipeLen = Math.sqrt(swipe.x * swipe.x + swipe.y * swipe.y);
  if (swipeLen < SWIPE_THRESHOLD_PX) return;

  if (base.laserCooldown > 0) {
    soundManager.playError();
    return;
  }

  // Convert screen coordinates to world coordinates properly
  const worldStart = screenToWorldPosition(state, canvas, startPos);
  const worldEnd = screenToWorldPosition(state, canvas, { x: startPos.x + swipe.x, y: startPos.y + swipe.y });
  const swipeDir = normalize(subtract(worldEnd, worldStart));

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

// Handle setting rally point by dragging from a selected base
function handleSetRallyPoint(
  state: GameState,
  base: Base,
  swipe: { x: number; y: number },
  canvas: HTMLCanvasElement
): void {
  const swipeLen = Math.sqrt(swipe.x * swipe.x + swipe.y * swipe.y);
  if (swipeLen < SWIPE_THRESHOLD_PX) return;

  // Convert screen space swipe delta to world space delta properly
  // by using the base position as anchor point
  const baseScreenPos = worldToScreenPosition(state, canvas, base.position);
  const swipeEndScreenPos = { x: baseScreenPos.x + swipe.x, y: baseScreenPos.y + swipe.y };
  const swipeEndWorldPos = screenToWorldPosition(state, canvas, swipeEndScreenPos);
  const swipeWorldDelta = subtract(swipeEndWorldPos, base.position);
  
  // Set rally point based on swipe direction and distance
  const newRallyPoint = add(base.position, swipeWorldDelta);
  base.rallyPoint = newRallyPoint;
  
  soundManager.playUnitMove();
}

function handleMiningDepotDrag(state: GameState, depot: import('./types').MiningDepot, startWorldPos: Vector2, endWorldPos: Vector2, playerIndex: number): void {
  // Allow canceling the mining drone if released near the depot
  if (distance(endWorldPos, depot.position) <= MINING_DEPOT_CANCEL_RADIUS) {
    return;
  }

  // Snap to the closest deposit in the drag direction that is still available
  const targetDeposit = findSnappedResourceDeposit(depot, startWorldPos, endWorldPos);
  
  if (!targetDeposit) {
    // No valid deposit at end position
    return;
  }
  
  // Check if deposit already has a worker
  const currentWorkers = targetDeposit.workerIds ?? [];
  if (currentWorkers.length >= 2) {
    soundManager.playError();
    return;
  }
  
  // Check if player has enough photons
  const miningDroneCost = 10;
  if (state.players[playerIndex].photons < miningDroneCost) {
    soundManager.playError();
    return;
  }
  
  // Deduct cost
  state.players[playerIndex].photons -= miningDroneCost;
  
  // Create mining drone at depot position
  const droneId = generateId();
  const existingWorkerId = currentWorkers[0];
  const existingWorker = existingWorkerId ? state.units.find((unit) => unit.id === existingWorkerId) : undefined;
  const distanceToDepot = existingWorker ? distance(existingWorker.position, depot.position) : 0;
  const distanceToDeposit = existingWorker ? distance(existingWorker.position, targetDeposit.position) : 0;
  const shouldStartAtDepot = existingWorker ? distanceToDepot <= distanceToDeposit : true;

  // Nudge the existing worker so paired drones stay in alternating cadence.
  if (existingWorker?.miningState) {
    existingWorker.miningState.cadenceDelay = 0.5;
  }

  const initialTarget = shouldStartAtDepot ? targetDeposit.position : depot.position;
  const drone: Unit = {
    id: droneId,
    type: 'miningDrone',
    owner: playerIndex,
    position: { ...depot.position },
    hp: UNIT_DEFINITIONS.miningDrone.hp,
    maxHp: UNIT_DEFINITIONS.miningDrone.hp,
    armor: UNIT_DEFINITIONS.miningDrone.armor,
    commandQueue: [{ type: 'move', position: initialTarget }],
    damageMultiplier: 1.0,
    distanceTraveled: 0,
    distanceCredit: 0,
    abilityCooldown: 0,
    attackCooldown: 0,
    miningState: {
      depotId: depot.id,
      depositId: targetDeposit.id,
      atDepot: shouldStartAtDepot,
      cadenceDelay: shouldStartAtDepot ? 0 : 0.5,
    },
  };
  
  state.units.push(drone);
  targetDeposit.workerIds = [...currentWorkers, droneId];
  
  // Income rate will be updated automatically by updateIncome function
  
  soundManager.playUnitTrain();
  
  // Create spawn effect
  const color = state.players[playerIndex].color;
  createSpawnEffect(state, depot.position, color);
}

function handleBaseSwipe(state: GameState, base: Base, swipe: { x: number; y: number }, playerIndex: number): void {
  const swipeLen = Math.sqrt(swipe.x * swipe.x + swipe.y * swipe.y);
  if (swipeLen < SWIPE_THRESHOLD_PX) return;

  const angle = Math.atan2(-swipe.y, swipe.x);
  const angleDeg = (angle * 180) / Math.PI;

  let spawnType: UnitType | null = null;

  if (angleDeg >= -45 && angleDeg < 45) {
    spawnType = state.settings.unitSlots.right;
  } else if (angleDeg >= 45 && angleDeg < 135) {
    spawnType = state.settings.unitSlots.up;
  } else if (angleDeg < -45 && angleDeg >= -135) {
    spawnType = state.settings.unitSlots.down;
  } else {
    spawnType = state.settings.unitSlots.left;
  }

  // Use the base's rally point instead of directional offsets
  if (spawnType) {
    const success = spawnUnit(state, playerIndex, spawnType, base.position, base.rallyPoint);
    if (!success) {
      soundManager.playError();
    } else if (state.vsMode === 'online' && state.multiplayerManager) {
      // Send spawn command to multiplayer backend
      sendSpawnCommand(state.multiplayerManager, playerIndex, spawnType, base.id, base.rallyPoint).catch(err => 
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

// Determine whether a unit should be visible/selectable to the given player.
function isUnitVisibleToPlayer(unit: Unit, playerIndex: number): boolean {
  if (unit.owner === playerIndex) {
    return true;
  }

  return !unit.cloaked;
}

// Find the first visible unit under the cursor for selection and double-tap logic.
function getVisibleUnitAtPosition(state: GameState, worldPos: { x: number; y: number }, playerIndex: number): Unit | undefined {
  return state.units.find((unit) => {
    if (!isUnitVisibleToPlayer(unit, playerIndex)) return false;
    return distance(unit.position, worldPos) < getUnitSelectionRadius(unit);
  });
}

// Handle double-tap: select same-type friendly units or deselect everything
function handleDoubleTap(state: GameState, worldPos: { x: number; y: number }, playerIndex: number): void {
  const tappedUnit = getVisibleUnitAtPosition(state, worldPos, playerIndex);

  // Clear current selections either way
  state.selectedUnits.clear();
  state.bases.forEach((b) => (b.isSelected = false));

  if (tappedUnit && tappedUnit.owner === playerIndex) {
    state.units.forEach((unit) => {
      if (unit.owner === playerIndex && unit.type === tappedUnit.type) {
        state.selectedUnits.add(unit.id);
      }
    });
  }

  soundManager.playUnitSelect(); // Play feedback sound
}

function handleTap(state: GameState, screenPos: { x: number; y: number }, canvas: HTMLCanvasElement, playerIndex: number): void {
  const worldPos = screenToWorldPosition(state, canvas, screenPos);

  // Check for double-tap first
  if (isDoubleTap(state, screenPos)) {
    handleDoubleTap(state, worldPos, playerIndex);
    return;
  }
  
  const tappedUnit = state.units.find((unit) => {
    if (unit.owner !== playerIndex) return false;
    return distance(unit.position, worldPos) < getUnitSelectionRadius(unit);
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

function getUnitSelectionRadius(unit: Unit): number {
  // Scale mining drone selection to match their larger render footprint.
  const sizeMultiplier = unit.type === 'miningDrone' ? MINING_DRONE_SIZE_MULTIPLIER : 1;
  return (UNIT_SIZE_METERS * sizeMultiplier) / 2;
}

function handleAbilityDrag(state: GameState, dragVector: { x: number; y: number }, worldStart: { x: number; y: number }): void {
  const dragLen = distance({ x: 0, y: 0 }, dragVector);
  const clampedLen = Math.min(dragLen, ABILITY_MAX_RANGE);
  const direction = normalize(dragVector);
  const clampedVector = scale(direction, clampedLen);

  state.units.forEach((unit) => {
    if (!state.selectedUnits.has(unit.id)) return;

    // Use the command origin helper for consistency (last movement node)
    const startPosition = getCommandOrigin(unit);

    // Ability should be cast from startPosition, not from a far position
    // Copy the position/vector so later queue updates don't mutate the ability anchor
    const abilityNode: CommandNode = { type: 'ability', position: { ...startPosition }, direction: { ...clampedVector } };

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
function updateAbilityCastPreview(
  state: GameState,
  screenDx: number,
  screenDy: number,
  screenStartPos: { x: number; y: number },
  canvas: HTMLCanvasElement
): void {
  // Get the first selected unit to determine the command origin
  const selectedUnit = state.units.find(unit => state.selectedUnits.has(unit.id));
  if (!selectedUnit) {
    delete state.abilityCastPreview;
    return;
  }
  
  const commandOrigin = getCommandOrigin(selectedUnit);
  
  // Convert screen drag distance to world space vector, accounting for desktop rotation
  const screenEndPos = {
    x: screenStartPos.x + screenDx,
    y: screenStartPos.y + screenDy,
  };
  const worldStartPos = screenToWorldPosition(state, canvas, screenStartPos);
  const worldEndPos = screenToWorldPosition(state, canvas, screenEndPos);
  let dragVectorWorld = subtract(worldEndPos, worldStartPos);
  
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
    screenStartPos
  };
}

// Helper function to execute ability drag from vector-based input
function handleVectorBasedAbilityDrag(state: GameState, dragVector: { x: number; y: number }): void {
  const clampedVector = clampVectorToRange(dragVector, ABILITY_MAX_RANGE);
  
  const selectedUnitsArray = state.units.filter(unit => state.selectedUnits.has(unit.id));

  // Apply ability command to all selected units
  selectedUnitsArray.forEach((unit) => {
    // Use the command origin (last movement node or current position)
    const startPosition = getCommandOrigin(unit);

    // Ability should be cast from startPosition, not from a far position
    // Copy the position/vector so later queue updates don't mutate the ability anchor
    const abilityNode: CommandNode = { type: 'ability', position: { ...startPosition }, direction: { ...clampedVector } };

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
  // Always use current position as the return point for new patrol commands
  // This prevents the bug where units with queued commands would patrol back to
  // an old queued position instead of their current location
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
  
  // Space units farther apart than their collision radius to prevent stacking at a shared move target.
  const formationSpacing = UNIT_SIZE_METERS * 0.9;

  // Always apply formation logic to ensure proper spacing
  // Even with 'none' formation, units will be spaced apart to prevent stacking
  const formationPositions = applyFormation(
    selectedUnitsArray,
    worldPos,
    state.currentFormation || 'none',
    formationSpacing
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
  const worldPos = screenToWorldPosition(state, canvas, { x, y });
  
  // Add visual feedback for mouse down
  addVisualFeedback(state, canvas, 'tap', { x, y });

  const playerIndex = resolvePlayerIndex(state, x);

  const touchedBase = findTouchedBase(state, worldPos, playerIndex);
  const touchedDot = findTouchedMovementDot(state, worldPos, playerIndex);
  const touchedDepot = findTouchedMiningDepot(state, worldPos, playerIndex);

  mouseState = {
    startPos: { x, y },
    startTime: Date.now(),
    isDragging: false,
    selectedUnitsSnapshot: new Set(state.selectedUnits),
    touchedBase,
    touchedBaseWasSelected: touchedBase?.isSelected || false,
    touchedMovementDot: touchedDot,
    touchedDepot,
    touchedDepotPos: touchedDepot ? worldPos : undefined,
  };
}

export function handleMouseMove(e: MouseEvent, state: GameState, canvas: HTMLCanvasElement): void {
  if (state.mode !== 'game') return;
  
  const rect = canvas.getBoundingClientRect();
  const { x, y } = transformCoordinates(e.clientX, e.clientY, rect);
  
  // Update tooltip if not dragging
  if (!mouseState || !mouseState.isDragging) {
    const worldPos = screenToWorldPosition(state, canvas, { x, y });
    
    // Check for unit hover - show info for all visible units (player and enemy)
    const hoveredUnit = state.units.find(unit => {
      const dist = distance(worldPos, unit.position);
      if (dist >= 0.8) return false; // Outside unit radius
      
      // For enemy units, check if they're visible (fog of war)
      if (unit.owner !== 0) {
        return isVisibleToPlayer(unit.position, state);
      }
      
      return true; // Show player units
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
    const playerIndex = resolvePlayerIndex(state, mouseState.startPos.x);
    const selectedBase = getSelectedBase(state, playerIndex);

    // Skip selection rects when the base is selected so swipes spawn units anywhere
    if (!mouseState.touchedBase && !mouseState.touchedDepot && state.selectedUnits.size === 0 && !selectedBase) {
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
  
  // Update rally point preview when dragging from a selected base
  if (mouseState.isDragging && mouseState.touchedBase && mouseState.touchedBaseWasSelected) {
    // Convert screen space swipe delta to world space delta properly
    const baseScreenPos = worldToScreenPosition(state, canvas, mouseState.touchedBase.position);
    const swipeEndScreenPos = { x: baseScreenPos.x + dx, y: baseScreenPos.y + dy };
    const swipeEndWorldPos = screenToWorldPosition(state, canvas, swipeEndScreenPos);
    const swipeWorldDelta = subtract(swipeEndWorldPos, mouseState.touchedBase.position);
    const newRallyPoint = add(mouseState.touchedBase.position, swipeWorldDelta);
    
    state.rallyPointPreview = {
      baseId: mouseState.touchedBase.id,
      rallyPoint: newRallyPoint
    };
  } else {
    // Clear rally point preview if not dragging from base
    delete state.rallyPointPreview;
  }
  
  // Update ability cast preview when units are selected and dragging
  if (mouseState.isDragging && state.selectedUnits.size > 0 && !mouseState.touchedBase && !mouseState.touchedMovementDot) {
    updateAbilityCastPreview(state, dx, dy, mouseState.startPos, canvas);
  }
  
  // Update mining depot drag preview so the line snaps toward the closest available deposit
  if (mouseState.isDragging && mouseState.touchedDepot && mouseState.touchedDepotPos) {
    const endWorldPos = screenToWorldPosition(state, canvas, { x, y });
    const snappedDeposit = findSnappedResourceDeposit(mouseState.touchedDepot, mouseState.touchedDepotPos, endWorldPos);

    if (snappedDeposit) {
      state.miningDragPreview = {
        depotId: mouseState.touchedDepot.id,
        depositId: snappedDeposit.id,
      };
    } else {
      delete state.miningDragPreview;
    }
  }
  
  // Update base ability preview when base is selected and dragging (but not from the base itself)
  updateBaseAbilityPreview(state, mouseState.isDragging, mouseState.touchedBase, mouseState.startPos, dx, dy, canvas);
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

  const playerIndex = resolvePlayerIndex(state, mouseState.startPos.x);
  
  // Add visual feedback for drag if moved significantly
  if (mouseState.isDragging && dist > 10) {
    addVisualFeedback(state, canvas, 'drag', mouseState.startPos, { x, y });
  }

  if (mouseState.selectionRect) {
    handleRectSelection(state, mouseState.selectionRect, canvas, playerIndex);
  } else if (mouseState.touchedMovementDot) {
    handleLaserSwipe(state, mouseState.touchedMovementDot, { x: dx, y: dy });
  } else if (mouseState.touchedDepot && mouseState.isDragging && dist > SWIPE_THRESHOLD_PX && mouseState.touchedDepotPos) {
    // Handle mining depot drag to create mining drone
    const endWorldPos = screenToWorldPosition(state, canvas, { x, y });
    handleMiningDepotDrag(state, mouseState.touchedDepot, mouseState.touchedDepotPos, endWorldPos, playerIndex);
  } else if (mouseState.touchedBase && !mouseState.isDragging) {
    const base = mouseState.touchedBase;
    
    // Check for double-click to deselect base
    if (isDoubleTap(state, { x, y })) {
      // Double-click: deselect the base
      state.bases.forEach((b) => (b.isSelected = false));
    } else if (base.isSelected) {
      base.isSelected = false;
    } else {
      state.bases.forEach((b) => (b.isSelected = false));
      base.isSelected = true;
      state.selectedUnits.clear();
    }
  } else if (mouseState.touchedBase && mouseState.isDragging && dist > SWIPE_THRESHOLD_PX) {
    // If base was already selected, dragging from it sets rally point
    // If base was not selected, dragging from it spawns units
    if (mouseState.touchedBaseWasSelected) {
      handleSetRallyPoint(state, mouseState.touchedBase, { x: dx, y: dy }, canvas);
      delete state.rallyPointPreview; // Clear preview after setting rally point
    } else if (state.settings.controlMode === 'swipe') {
      // Only spawn units via swipe in swipe mode
      handleBaseSwipe(state, mouseState.touchedBase, { x: dx, y: dy }, playerIndex);
    }
  } else if (mouseState.isDragging && dist > SWIPE_THRESHOLD_PX) {
    // Clear rally point preview if drag ended without setting rally point (and continuing to other actions)
    delete state.rallyPointPreview;
    
    const selectedBase = getSelectedBase(state, playerIndex);

    // When base is selected and drag is NOT from the base, queue the base's ability
    if (selectedBase && state.selectedUnits.size === 0 && !mouseState.touchedBase) {
      handleBaseAbilityDrag(state, selectedBase, { x: dx, y: dy }, mouseState.startPos, canvas);
    } else if (state.selectedUnits.size > 0 && !mouseState.touchedBase && !mouseState.touchedMovementDot) {
      // Handle ability drag for selected units
      const worldStart = screenToWorldPosition(state, canvas, mouseState.startPos);
      const worldEnd = screenToWorldPosition(state, canvas, { x, y });
      let dragVectorWorld = subtract(worldEnd, worldStart);
      
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
  } else if (state.settings.controlMode === 'radial' && elapsed >= HOLD_TIME_MS && dist < 20 && !mouseState.touchedBase && !mouseState.touchedDepot && state.selectedUnits.size === 0) {
    // Show radial menu for long press in radial mode (not on base or depot, no units selected)
    const worldPos = screenToWorldPosition(state, canvas, { x, y });
    state.radialMenu = {
      worldPosition: worldPos,
      visible: true,
      startTime: Date.now(),
    };
  } else {
    // Clear preview if no valid action was taken
    delete state.abilityCastPreview;
  }
  
  // Clear all input-related previews when mouse is released
  clearBaseAbilityPreview(state);
  delete state.miningDragPreview;

  mouseState = null;
}

// Helper function to update base ability preview when dragging
function updateBaseAbilityPreview(
  state: GameState,
  isDragging: boolean,
  touchedBase: Base | undefined,
  startPos: { x: number; y: number },
  dx: number,
  dy: number,
  canvas: HTMLCanvasElement
): void {
  const playerIndex = resolvePlayerIndex(state, startPos.x);
  const selectedBase = getSelectedBase(state, playerIndex);
  
  if (isDragging && selectedBase && state.selectedUnits.size === 0 && !touchedBase) {
    const worldStart = screenToWorldPosition(state, canvas, startPos);
    const worldEnd = screenToWorldPosition(state, canvas, { x: startPos.x + dx, y: startPos.y + dy });
    const swipeDir = normalize(subtract(worldEnd, worldStart));
    
    state.baseAbilityPreview = {
      baseId: selectedBase.id,
      basePosition: selectedBase.position,
      direction: swipeDir
    };
  } else {
    // Clear base ability preview if not in the right state
    delete state.baseAbilityPreview;
  }
}

// Helper function to clear base ability preview
function clearBaseAbilityPreview(state: GameState): void {
  delete state.baseAbilityPreview;
}

// Handle building placement from radial menu
function handleBuildingPlacement(
  state: GameState,
  buildingMenu: NonNullable<GameState['buildingMenu']>,
  playerIndex: number
): void {
  const { selectedType, currentPosition } = buildingMenu;
  
  if (!selectedType) return;
  
  const structureDef = STRUCTURE_DEFINITIONS[selectedType];
  const player = state.players[playerIndex];
  
  // Check if player has enough Latticite
  if (!player.secondaryResource || player.secondaryResource < structureDef.cost) {
    soundManager.play('error');
    return;
  }
  
  // Check if position is valid (not overlapping with other structures, bases, or obstacles)
  const isValidPosition = !state.structures.some(s => 
    distance(s.position, currentPosition) < (structureDef.size + 1)
  ) && !state.bases.some(b => 
    distance(b.position, currentPosition) < (BASE_SIZE_METERS + structureDef.size) / 2
  ) && !state.obstacles.some(obs => {
    const dx = currentPosition.x - obs.x;
    const dy = currentPosition.y - obs.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < (obs.radius + structureDef.size / 2);
  });
  
  if (!isValidPosition) {
    soundManager.play('error');
    return;
  }
  
  // Deduct Latticite cost
  player.secondaryResource -= structureDef.cost;
  
  // Create the structure
  const newStructure: import('./types').Structure = {
    id: generateId(),
    type: selectedType,
    owner: playerIndex,
    position: currentPosition,
    hp: structureDef.hp,
    maxHp: structureDef.hp,
    armor: structureDef.armor,
    attackCooldown: 0,
  };
  
  state.structures.push(newStructure);
  
  // Create spawn effect
  createSpawnEffect(state, currentPosition, player.color);
  
  // Play building placement sound
  soundManager.playBuildingPlace();
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
