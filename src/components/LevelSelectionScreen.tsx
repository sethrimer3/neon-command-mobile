import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { ArrowLeft, MapPin } from '@phosphor-icons/react';
import { ARENA_HEIGHT_METERS, ARENA_WIDTH_METERS, BASE_SIZE_METERS } from '@/lib/types';
import { getMapList, getValidBasePositions, MapDefinition } from '@/lib/maps';

/**
 * Converts a meter-based size into a percent string based on the arena dimension.
 * @param value - The value in meters to convert.
 * @param total - The total arena dimension in meters.
 * @returns Percentage string usable in inline styles.
 */
function metersToPercent(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

/**
 * Builds inline styles for obstacle previews based on arena scaling.
 * @param map - The map definition driving the preview.
 * @returns Array of obstacle preview styles for rendering.
 */
function getObstaclePreviewStyles(map: MapDefinition) {
  const arenaWidth = map.arenaWidth ?? ARENA_WIDTH_METERS;
  const arenaHeight = map.arenaHeight ?? ARENA_HEIGHT_METERS;

  return map.obstacles.map((obstacle) => ({
    key: obstacle.id,
    left: metersToPercent(obstacle.position.x - obstacle.width / 2, arenaWidth),
    top: metersToPercent(obstacle.position.y - obstacle.height / 2, arenaHeight),
    width: metersToPercent(obstacle.width, arenaWidth),
    height: metersToPercent(obstacle.height, arenaHeight),
    rotation: obstacle.rotation,
    type: obstacle.type,
  }));
}

/**
 * Builds inline styles for base previews based on arena scaling.
 * @param map - The map definition driving the preview.
 * @returns Base styles for player and enemy positions.
 */
function getBasePreviewStyles(map: MapDefinition) {
  const arenaWidth = map.arenaWidth ?? ARENA_WIDTH_METERS;
  const arenaHeight = map.arenaHeight ?? ARENA_HEIGHT_METERS;
  const basePositions = getValidBasePositions(arenaWidth, arenaHeight, map.obstacles, false);
  const baseSize = BASE_SIZE_METERS;
  // Convert base size to both axes so previews respect the arena aspect ratio.
  const baseWidth = metersToPercent(baseSize, arenaWidth);
  const baseHeight = metersToPercent(baseSize, arenaHeight);

  return {
    player: {
      left: metersToPercent(basePositions.player.x - baseSize / 2, arenaWidth),
      top: metersToPercent(basePositions.player.y - baseSize / 2, arenaHeight),
      width: baseWidth,
      height: baseHeight,
    },
    enemy: {
      left: metersToPercent(basePositions.enemy.x - baseSize / 2, arenaWidth),
      top: metersToPercent(basePositions.enemy.y - baseSize / 2, arenaHeight),
      width: baseWidth,
      height: baseHeight,
    },
  };
}

/**
 * Renders a small preview of the arena layout with bases and obstacles marked.
 * @param map - Map data for the preview.
 */
function LevelPreview({ map }: { map: MapDefinition }) {
  const obstacleStyles = getObstaclePreviewStyles(map);
  const baseStyles = getBasePreviewStyles(map);

  return (
    <div className="relative w-full overflow-hidden rounded-md border border-border bg-muted/40 h-32">
      {/* Render obstacles as scaled blocks for a quick visual layout overview. */}
      {obstacleStyles.map((obstacle) => (
        <div
          key={obstacle.key}
          className={`absolute rounded-sm ${
            obstacle.type === 'wall'
              ? 'bg-slate-500/70'
              : obstacle.type === 'pillar'
              ? 'bg-slate-400/80'
              : obstacle.type === 'debris'
              ? 'bg-amber-500/60'
              : 'bg-slate-700/60'
          }`}
          style={{
            left: obstacle.left,
            top: obstacle.top,
            width: obstacle.width,
            height: obstacle.height,
            transform: `rotate(${obstacle.rotation}rad)`,
          }}
        />
      ))}
      {/* Mark player base position for easy recognition. */}
      <div
        className="absolute rounded-full bg-sky-400/80 border border-sky-200 shadow-[0_0_6px_rgba(56,189,248,0.8)]"
        style={{
          left: baseStyles.player.left,
          top: baseStyles.player.top,
          width: baseStyles.player.width,
          height: baseStyles.player.height,
        }}
      />
      {/* Mark enemy base position for clear confrontation direction. */}
      <div
        className="absolute rounded-full bg-rose-400/80 border border-rose-200 shadow-[0_0_6px_rgba(251,113,133,0.8)]"
        style={{
          left: baseStyles.enemy.left,
          top: baseStyles.enemy.top,
          width: baseStyles.enemy.width,
          height: baseStyles.enemy.height,
        }}
      />
    </div>
  );
}

interface LevelSelectionScreenProps {
  onBack: () => void;
  onSelectLevel: (mapId: string) => void;
  currentMap: string;
}

export function LevelSelectionScreen({
  onBack,
  onSelectLevel,
  currentMap,
}: LevelSelectionScreenProps) {
  const maps = getMapList();

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
      <Card className="w-full max-w-3xl flex flex-col my-auto">
        <CardHeader>
          <CardTitle className="orbitron text-2xl">Select Level</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col space-y-4">
          {/* Constrain height so the list reliably scrolls on smaller viewports. */}
          <ScrollArea className="h-[60vh]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-1 pr-3">
              {maps.map((map) => (
                <div
                  key={map.id}
                  className={`p-4 rounded-lg border-2 transition-all cursor-pointer hover:shadow-lg ${
                    currentMap === map.id
                      ? 'border-primary bg-primary/10 shadow-md'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => onSelectLevel(map.id)}
                >
                  <div className="flex items-start gap-3">
                    <MapPin size={24} className="text-primary flex-shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <h3 className="orbitron font-semibold text-lg mb-2">
                        {map.name}
                      </h3>
                      <LevelPreview map={map} />
                      <p className="text-sm text-muted-foreground mt-2">
                        {map.description}
                      </p>
                      <div className="mt-3 text-xs text-muted-foreground">
                        {map.obstacles.length === 0 
                          ? 'No obstacles' 
                          : `${map.obstacles.length} obstacle${map.obstacles.length > 1 ? 's' : ''}`}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <Button
            onClick={onBack}
            className="w-full orbitron"
            variant="outline"
          >
            <ArrowLeft className="mr-2" size={20} />
            Back
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
