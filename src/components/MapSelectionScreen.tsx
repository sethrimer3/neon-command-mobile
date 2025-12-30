import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { ArrowLeft, MapPin } from '@phosphor-icons/react';
import { getMapList } from '../lib/maps';

interface MapSelectionScreenProps {
  selectedMap: string;
  onMapSelect: (mapId: string) => void;
  onBack: () => void;
}

export function MapSelectionScreen({ selectedMap, onMapSelect, onBack }: MapSelectionScreenProps) {
  const maps = getMapList();

  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 overflow-auto">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="orbitron text-2xl flex items-center gap-2">
            <MapPin size={28} />
            Map Selection
          </CardTitle>
          <CardDescription>Choose your battlefield</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScrollArea className="h-[60vh]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-4">
              {maps.map((map) => (
                <Card
                  key={map.id}
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    selectedMap === map.id
                      ? 'border-primary shadow-primary/50'
                      : 'border-border'
                  }`}
                  onClick={() => onMapSelect(map.id)}
                >
                  <CardHeader>
                    <CardTitle className="text-lg orbitron">{map.name}</CardTitle>
                    <CardDescription className="text-sm">
                      {map.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Obstacles: {map.obstacles.length}</span>
                      {selectedMap === map.id && (
                        <span className="text-primary font-medium">Selected</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          <Button onClick={onBack} className="w-full orbitron" variant="outline">
            <ArrowLeft className="mr-2" size={20} />
            Back to Menu
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
