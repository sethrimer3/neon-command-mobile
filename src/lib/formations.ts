/**
 * Formation system for coordinated unit movement
 * Provides tactical positioning options for groups of units
 */

import { Vector2, Unit, UNIT_SIZE_METERS } from './types';
import { distance, normalize, scale, add, subtract } from './gameUtils';

export type FormationType = 'none' | 'line' | 'spread' | 'cluster' | 'wedge' | 'circle';

interface FormationOffset {
  x: number;
  y: number;
}

/**
 * Calculate formation offsets for a group of units
 * Returns an array of offset positions relative to the formation center
 */
export function calculateFormationOffsets(
  unitCount: number,
  formationType: FormationType,
  spacing: number = 2.0 // meters between units
): FormationOffset[] {
  const offsets: FormationOffset[] = [];

  switch (formationType) {
    case 'line':
      // Horizontal line formation
      for (let i = 0; i < unitCount; i++) {
        const x = (i - (unitCount - 1) / 2) * spacing;
        offsets.push({ x, y: 0 });
      }
      break;

    case 'spread':
      // Grid formation - units spread evenly in a square
      const cols = Math.ceil(Math.sqrt(unitCount));
      const rows = Math.ceil(unitCount / cols);
      let index = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (index >= unitCount) break;
          const x = (col - (cols - 1) / 2) * spacing;
          const y = (row - (rows - 1) / 2) * spacing;
          offsets.push({ x, y });
          index++;
        }
      }
      break;

    case 'cluster':
      // Tight cluster - units pack closely together
      const clusterSpacing = spacing * 0.6;
      const clusterCols = Math.ceil(Math.sqrt(unitCount));
      const clusterRows = Math.ceil(unitCount / clusterCols);
      let clusterIndex = 0;
      for (let row = 0; row < clusterRows; row++) {
        for (let col = 0; col < clusterCols; col++) {
          if (clusterIndex >= unitCount) break;
          const x = (col - (clusterCols - 1) / 2) * clusterSpacing;
          const y = (row - (clusterRows - 1) / 2) * clusterSpacing;
          offsets.push({ x, y });
          clusterIndex++;
        }
      }
      break;

    case 'wedge':
      // V-shaped wedge formation - good for assault
      const wedgeRows = Math.ceil(Math.sqrt(unitCount * 2));
      let wedgeIndex = 0;
      for (let row = 0; row < wedgeRows && wedgeIndex < unitCount; row++) {
        const unitsInRow = row + 1;
        for (let col = 0; col < unitsInRow && wedgeIndex < unitCount; col++) {
          const x = (col - (unitsInRow - 1) / 2) * spacing;
          const y = row * spacing;
          offsets.push({ x, y });
          wedgeIndex++;
        }
      }
      break;

    case 'circle':
      // Circular formation - good for defense
      const radius = Math.max(spacing * 2, (unitCount * spacing) / (2 * Math.PI));
      for (let i = 0; i < unitCount; i++) {
        const angle = (i / unitCount) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        offsets.push({ x, y });
      }
      break;

    default:
    case 'none':
      // Auto-spacing: create a compact grid to prevent units from stacking
      // This ensures units have individual positions even when no formation is selected
      if (unitCount === 1) {
        offsets.push({ x: 0, y: 0 });
      } else {
        const cols = Math.ceil(Math.sqrt(unitCount));
        const rows = Math.ceil(unitCount / cols);
        let index = 0;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            if (index >= unitCount) break;
            const x = (col - (cols - 1) / 2) * spacing;
            const y = (row - (rows - 1) / 2) * spacing;
            offsets.push({ x, y });
            index++;
          }
        }
      }
      break;
  }

  return offsets;
}

/**
 * Apply formation to a group of units moving to a target position
 * Returns an array of individual target positions for each unit
 */
export function applyFormation(
  units: Unit[],
  targetPosition: Vector2,
  formationType: FormationType,
  spacing: number = 2.0
): Vector2[] {
  if (units.length === 0) return [];
  
  // Single unit - just go to target
  if (units.length === 1) {
    return [{ ...targetPosition }];
  }

  // Calculate formation offsets (now 'none' also creates spacing)
  const offsets = calculateFormationOffsets(units.length, formationType, spacing);

  // Calculate average current position of units (formation center)
  const currentCenter = {
    x: units.reduce((sum, u) => sum + u.position.x, 0) / units.length,
    y: units.reduce((sum, u) => sum + u.position.y, 0) / units.length,
  };

  // Calculate direction from current center to target
  const directionVector = subtract(targetPosition, currentCenter);
  const directionLength = Math.sqrt(directionVector.x * directionVector.x + directionVector.y * directionVector.y);
  
  // If target is at current position, use default forward direction
  const direction = directionLength > 0.01 
    ? normalize(directionVector) 
    : { x: 0, y: -1 }; // Default to facing up
  
  // Calculate perpendicular direction for proper formation orientation
  const perpendicular = { x: -direction.y, y: direction.x };

  // Apply offsets rotated to face the movement direction
  return offsets.map((offset) => {
    // Rotate offset based on movement direction
    const rotatedX = offset.x * perpendicular.x + offset.y * direction.x;
    const rotatedY = offset.x * perpendicular.y + offset.y * direction.y;
    
    return {
      x: targetPosition.x + rotatedX,
      y: targetPosition.y + rotatedY,
    };
  });
}

/**
 * Get formation name for display
 */
export function getFormationName(formation: FormationType): string {
  switch (formation) {
    case 'line': return 'Line Formation';
    case 'spread': return 'Spread Formation';
    case 'cluster': return 'Cluster Formation';
    case 'wedge': return 'Wedge Formation';
    case 'circle': return 'Circle Formation';
    case 'none':
    default: return 'No Formation';
  }
}

/**
 * Get formation description for tooltips
 */
export function getFormationDescription(formation: FormationType): string {
  switch (formation) {
    case 'line': return 'Units form a horizontal line. Good for flanking and wide engagements.';
    case 'spread': return 'Units spread out in a grid. Reduces splash damage vulnerability.';
    case 'cluster': return 'Units pack tightly together. Maximum DPS concentration.';
    case 'wedge': return 'V-shaped assault formation. Strong frontal attack.';
    case 'circle': return 'Circular defensive formation. 360° coverage.';
    case 'none':
    default: return 'Units move to the same point without formation.';
  }
}
