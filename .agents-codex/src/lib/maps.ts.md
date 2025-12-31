# maps.ts

## Purpose
Defines map layouts, obstacles, and collision detection for the game. Provides map selection system with various arena configurations to add strategic variety to gameplay.

## Dependencies
### Imports
- `./types` - Vector2 and BASE_SIZE_METERS

### Used By
- `App.tsx` - Map selection and initialization
- `simulation.ts` - Collision detection during movement
- `MapSelectionScreen.tsx` - Map browser UI

## Key Components

### Types

#### ObstacleType
- `'wall'` - Linear barriers
- `'pillar'` - Point obstacles
- `'debris'` - Environmental clutter

#### Obstacle Interface
- **id**: Unique identifier
- **type**: ObstacleType
- **position**: Center position in game meters
- **width/height**: Dimensions in meters
- **rotation**: Rotation angle (currently always 0)

#### MapDefinition Interface
- **id**: Unique map identifier
- **name**: Display name
- **description**: Map characteristics
- **obstacles**: Array of obstacles
- **arenaWidth/Height**: Optional custom arena size

### Maps

#### MAPS Object
Contains 5 predefined maps:

1. **Open Arena** - No obstacles, pure combat
2. **The Corridor** - Narrow center passage
3. **Crossroads** - Four paths with center pillars
4. **Fortress Siege** - Heavily fortified center
5. **Scattered Debris** - Random obstacles throughout

### Functions

#### generateObstacleId(): string
- **Purpose:** Generate unique IDs for obstacles
- **Notes:** Combines timestamp and random string

#### getMapById(id: string): MapDefinition | undefined
- **Purpose:** Retrieve map definition by ID
- **Notes:** Returns undefined if not found

#### checkObstacleCollision(position, radius, obstacles): boolean
- **Purpose:** Check if circular entity collides with any obstacle
- **Returns:** True if collision detected
- **Notes:** Uses AABB (axis-aligned bounding box) collision

#### getValidBasePositions(mapId, arenaWidth, arenaHeight): Vector2[]
- **Purpose:** Find safe spawn positions for bases
- **Returns:** Array of valid positions (typically 2 for both players)
- **Notes:** 
  - Tests grid positions for collision
  - Ensures bases don't spawn in obstacles
  - Returns positions on opposite sides of arena

## Terminology
- **AABB**: Axis-Aligned Bounding Box collision detection
- **Arena**: Playable map area
- **Obstacle**: Static impassable object
- **Safe Spawn**: Position with no obstacle collision

## Implementation Notes

### Critical Details
- Obstacle positions are in game meters (not pixels)
- Collision uses circle-to-rectangle intersection
- Base positions must have clearance for BASE_SIZE_METERS
- Maps can have custom arena sizes (default is screen-based)
- Rotation is defined but not currently used in collision

### Collision Detection
- Circular entities (units, bases) checked against rectangular obstacles
- Algorithm: Check if circle center is within rectangle bounds expanded by radius
- Efficient for real-time collision checking

### Map Balance
- Maps designed for strategic variety
- Open: Pure combat skill
- Corridor: Forced engagements
- Crossroads: Multiple attack paths
- Fortress: Defensive positioning
- Scattered: Tactical maneuvering

### Known Issues
- Rotation not implemented in collision detection
- No dynamic obstacles or destructible terrain

## Future Changes

### Planned
- More map variations
- Procedurally generated maps

### Needed
- Rotation support in collision detection
- Destructible obstacles
- Dynamic map elements (moving obstacles)
- Line-of-sight blocking for ranged units
- Height/elevation system
- Obstacle types with gameplay effects
- Map editor
- Custom arena sizes per map

## Change History
- Initial creation with 5 maps
- Added collision detection system
- Added base position validation

## Watch Out For
- Obstacle positions must be in meters, not pixels
- Collision radius must account for entity size
- Base positions need clearance for full base size (BASE_SIZE_METERS)
- Map IDs must match keys in MAPS object
- Invalid map IDs will cause errors - always validate
- getValidBasePositions may return fewer than 2 positions on invalid maps
- Collision detection assumes axis-aligned obstacles (rotation ignored)
- Large obstacles can make maps unplayable if positioned poorly
- Base positions should be on opposite sides for balanced gameplay
