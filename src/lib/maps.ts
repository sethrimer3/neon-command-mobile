import { Vector2, BASE_SIZE_METERS } from './types';

export type ObstacleType = 'wall' | 'pillar' | 'debris';

export interface Obstacle {
  id: string;
  type: ObstacleType;
  position: Vector2;
  width: number;
  height: number;
  rotation: number;
}

export interface MapDefinition {
  id: string;
  name: string;
  description: string;
  obstacles: Obstacle[];
  arenaWidth?: number;
  arenaHeight?: number;
}

function generateObstacleId(): string {
  return `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const MAPS: Record<string, MapDefinition> = {
  open: {
    id: 'open',
    name: 'Open Arena',
    description: 'Classic open battlefield with no obstacles',
    obstacles: [],
  },

  corridor: {
    id: 'corridor',
    name: 'The Corridor',
    description: 'Narrow central passage forces head-on engagements',
    obstacles: [
      { id: generateObstacleId(), type: 'wall', position: { x: 20, y: 10 }, width: 15, height: 2, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 20, y: 30 }, width: 15, height: 2, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 45, y: 10 }, width: 15, height: 2, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 45, y: 30 }, width: 15, height: 2, rotation: 0 },
    ],
  },

  crossroads: {
    id: 'crossroads',
    name: 'Crossroads',
    description: 'Four paths meet at the center with defensive pillars',
    obstacles: [
      { id: generateObstacleId(), type: 'wall', position: { x: 25, y: 15 }, width: 8, height: 2, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 25, y: 25 }, width: 8, height: 2, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 45, y: 15 }, width: 8, height: 2, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 45, y: 25 }, width: 8, height: 2, rotation: 0 },
      
      { id: generateObstacleId(), type: 'pillar', position: { x: 35, y: 20 }, width: 3, height: 3, rotation: 0 },
      { id: generateObstacleId(), type: 'pillar', position: { x: 30, y: 16 }, width: 2, height: 2, rotation: 0 },
      { id: generateObstacleId(), type: 'pillar', position: { x: 30, y: 24 }, width: 2, height: 2, rotation: 0 },
      { id: generateObstacleId(), type: 'pillar', position: { x: 40, y: 16 }, width: 2, height: 2, rotation: 0 },
      { id: generateObstacleId(), type: 'pillar', position: { x: 40, y: 24 }, width: 2, height: 2, rotation: 0 },
    ],
  },

  fortress: {
    id: 'fortress',
    name: 'Fortress Siege',
    description: 'Heavily fortified center with narrow attack lanes',
    obstacles: [
      { id: generateObstacleId(), type: 'wall', position: { x: 28, y: 12 }, width: 2, height: 8, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 28, y: 28 }, width: 2, height: 8, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 42, y: 12 }, width: 2, height: 8, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 42, y: 28 }, width: 2, height: 8, rotation: 0 },
      
      { id: generateObstacleId(), type: 'wall', position: { x: 32, y: 10 }, width: 8, height: 2, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 32, y: 36 }, width: 8, height: 2, rotation: 0 },
      
      { id: generateObstacleId(), type: 'pillar', position: { x: 35, y: 20 }, width: 4, height: 4, rotation: 0 },
    ],
  },

  labyrinth: {
    id: 'labyrinth',
    name: 'The Labyrinth',
    description: 'Complex maze requiring strategic positioning',
    obstacles: [
      { id: generateObstacleId(), type: 'wall', position: { x: 18, y: 10 }, width: 2, height: 10, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 25, y: 15 }, width: 2, height: 15, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 32, y: 10 }, width: 2, height: 10, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 38, y: 15 }, width: 2, height: 15, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 45, y: 10 }, width: 2, height: 10, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 52, y: 15 }, width: 2, height: 15, rotation: 0 },
      
      { id: generateObstacleId(), type: 'debris', position: { x: 22, y: 12 }, width: 2, height: 2, rotation: 0.3 },
      { id: generateObstacleId(), type: 'debris', position: { x: 29, y: 18 }, width: 2, height: 2, rotation: -0.2 },
      { id: generateObstacleId(), type: 'debris', position: { x: 35, y: 22 }, width: 2, height: 2, rotation: 0.5 },
      { id: generateObstacleId(), type: 'debris', position: { x: 42, y: 26 }, width: 2, height: 2, rotation: -0.4 },
      { id: generateObstacleId(), type: 'debris', position: { x: 48, y: 20 }, width: 2, height: 2, rotation: 0.1 },
    ],
  },

  choke: {
    id: 'choke',
    name: 'Choke Point',
    description: 'Single narrow passage between massive walls',
    obstacles: [
      { id: generateObstacleId(), type: 'wall', position: { x: 15, y: 8 }, width: 20, height: 3, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 15, y: 32 }, width: 20, height: 3, rotation: 0 },
      
      { id: generateObstacleId(), type: 'wall', position: { x: 45, y: 8 }, width: 20, height: 3, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 45, y: 32 }, width: 20, height: 3, rotation: 0 },
      
      { id: generateObstacleId(), type: 'pillar', position: { x: 33, y: 18 }, width: 2, height: 2, rotation: 0 },
      { id: generateObstacleId(), type: 'pillar', position: { x: 37, y: 22 }, width: 2, height: 2, rotation: 0 },
    ],
  },

  islands: {
    id: 'islands',
    name: 'Island Clusters',
    description: 'Scattered obstacle islands create multiple flanking routes',
    obstacles: [
      { id: generateObstacleId(), type: 'pillar', position: { x: 20, y: 15 }, width: 4, height: 4, rotation: 0 },
      { id: generateObstacleId(), type: 'debris', position: { x: 22, y: 18 }, width: 2, height: 2, rotation: 0.3 },
      
      { id: generateObstacleId(), type: 'pillar', position: { x: 28, y: 25 }, width: 5, height: 5, rotation: 0 },
      { id: generateObstacleId(), type: 'debris', position: { x: 30, y: 28 }, width: 2, height: 2, rotation: -0.4 },
      
      { id: generateObstacleId(), type: 'pillar', position: { x: 42, y: 15 }, width: 5, height: 5, rotation: 0 },
      { id: generateObstacleId(), type: 'debris', position: { x: 44, y: 18 }, width: 2, height: 2, rotation: 0.5 },
      
      { id: generateObstacleId(), type: 'pillar', position: { x: 50, y: 25 }, width: 4, height: 4, rotation: 0 },
      { id: generateObstacleId(), type: 'debris', position: { x: 52, y: 28 }, width: 2, height: 2, rotation: -0.2 },
      
      { id: generateObstacleId(), type: 'pillar', position: { x: 35, y: 20 }, width: 3, height: 3, rotation: 0 },
    ],
  },

  gauntlet: {
    id: 'gauntlet',
    name: 'The Gauntlet',
    description: 'Alternating barriers force zigzag movement',
    obstacles: [
      { id: generateObstacleId(), type: 'wall', position: { x: 20, y: 8 }, width: 2, height: 12, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 28, y: 20 }, width: 2, height: 12, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 36, y: 8 }, width: 2, height: 12, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 44, y: 20 }, width: 2, height: 12, rotation: 0 },
      { id: generateObstacleId(), type: 'wall', position: { x: 52, y: 8 }, width: 2, height: 12, rotation: 0 },
      
      { id: generateObstacleId(), type: 'debris', position: { x: 24, y: 16 }, width: 2, height: 2, rotation: 0.4 },
      { id: generateObstacleId(), type: 'debris', position: { x: 32, y: 24 }, width: 2, height: 2, rotation: -0.3 },
      { id: generateObstacleId(), type: 'debris', position: { x: 40, y: 16 }, width: 2, height: 2, rotation: 0.2 },
      { id: generateObstacleId(), type: 'debris', position: { x: 48, y: 24 }, width: 2, height: 2, rotation: -0.5 },
    ],
  },
};

export function getMapList(): MapDefinition[] {
  return Object.values(MAPS);
}

export function getMapById(id: string): MapDefinition | undefined {
  return MAPS[id];
}

export function checkObstacleCollision(
  position: Vector2,
  radius: number,
  obstacles: Obstacle[]
): boolean {
  for (const obstacle of obstacles) {
    const halfWidth = obstacle.width / 2;
    const halfHeight = obstacle.height / 2;

    const closestX = Math.max(
      obstacle.position.x - halfWidth,
      Math.min(position.x, obstacle.position.x + halfWidth)
    );
    const closestY = Math.max(
      obstacle.position.y - halfHeight,
      Math.min(position.y, obstacle.position.y + halfHeight)
    );

    const distanceX = position.x - closestX;
    const distanceY = position.y - closestY;
    const distanceSquared = distanceX * distanceX + distanceY * distanceY;

    if (distanceSquared < radius * radius) {
      return true;
    }
  }
  return false;
}

export function getValidBasePositions(
  arenaWidth: number,
  arenaHeight: number,
  obstacles: Obstacle[],
  isPortrait: boolean = false
): { player: Vector2; enemy: Vector2 } {
  const baseRadius = BASE_SIZE_METERS * 1.5;
  
  // In portrait mode, bases should be at bottom (player) and top (enemy)
  // In landscape mode, bases should be at left (player) and right (enemy)
  let playerPos: Vector2;
  let enemyPos: Vector2;
  
  if (isPortrait) {
    playerPos = { x: arenaWidth / 2, y: arenaHeight - BASE_SIZE_METERS * 2 };
    enemyPos = { x: arenaWidth / 2, y: BASE_SIZE_METERS * 2 };
  } else {
    playerPos = { x: BASE_SIZE_METERS * 2, y: arenaHeight / 2 };
    enemyPos = { x: arenaWidth - BASE_SIZE_METERS * 2, y: arenaHeight / 2 };
  }

  if (!checkObstacleCollision(playerPos, baseRadius, obstacles) &&
      !checkObstacleCollision(enemyPos, baseRadius, obstacles)) {
    return { player: playerPos, enemy: enemyPos };
  }

  // Try to find alternative positions with offsets
  if (isPortrait) {
    for (let offsetX = -5; offsetX <= 5; offsetX += 1) {
      const testPlayerPos = { x: arenaWidth / 2 + offsetX, y: arenaHeight - BASE_SIZE_METERS * 2 };
      const testEnemyPos = { x: arenaWidth / 2 + offsetX, y: BASE_SIZE_METERS * 2 };
      
      if (!checkObstacleCollision(testPlayerPos, baseRadius, obstacles) &&
          !checkObstacleCollision(testEnemyPos, baseRadius, obstacles)) {
        return { player: testPlayerPos, enemy: testEnemyPos };
      }
    }
  } else {
    for (let offsetY = -5; offsetY <= 5; offsetY += 1) {
      const testPlayerPos = { x: BASE_SIZE_METERS * 2, y: arenaHeight / 2 + offsetY };
      const testEnemyPos = { x: arenaWidth - BASE_SIZE_METERS * 2, y: arenaHeight / 2 + offsetY };
      
      if (!checkObstacleCollision(testPlayerPos, baseRadius, obstacles) &&
          !checkObstacleCollision(testEnemyPos, baseRadius, obstacles)) {
        return { player: testPlayerPos, enemy: testEnemyPos };
      }
    }
  }

  return { player: playerPos, enemy: enemyPos };
}

export function lineIntersectsObstacle(
  start: Vector2,
  end: Vector2,
  obstacles: Obstacle[]
): boolean {
  for (const obstacle of obstacles) {
    if (lineIntersectsRect(start, end, obstacle)) {
      return true;
    }
  }
  return false;
}

function lineIntersectsRect(
  start: Vector2,
  end: Vector2,
  obstacle: Obstacle
): boolean {
  const halfWidth = obstacle.width / 2;
  const halfHeight = obstacle.height / 2;
  
  const left = obstacle.position.x - halfWidth;
  const right = obstacle.position.x + halfWidth;
  const top = obstacle.position.y - halfHeight;
  const bottom = obstacle.position.y + halfHeight;

  const corners = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];

  for (let i = 0; i < corners.length; i++) {
    const c1 = corners[i];
    const c2 = corners[(i + 1) % corners.length];
    if (linesIntersect(start, end, c1, c2)) {
      return true;
    }
  }

  if (start.x >= left && start.x <= right && start.y >= top && start.y <= bottom) {
    return true;
  }
  if (end.x >= left && end.x <= right && end.y >= top && end.y <= bottom) {
    return true;
  }

  return false;
}

function linesIntersect(
  p1: Vector2,
  p2: Vector2,
  p3: Vector2,
  p4: Vector2
): boolean {
  const den = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
  if (den === 0) return false;

  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / den;
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / den;

  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}
