import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { ArrowLeft, MapPin } from '@phosphor-icons/react';
import { getMapList, MapDefinition } from '@/lib/maps';

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
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] flex flex-col">
        <CardHeader>
          <CardTitle className="orbitron text-2xl">Select Level</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden flex flex-col space-y-4">
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-1">
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
                      <p className="text-sm text-muted-foreground">
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
  );
}
