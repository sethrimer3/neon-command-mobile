/**
 * Keyboard shortcuts reference screen
 */
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, Keyboard } from '@phosphor-icons/react';

interface ShortcutItem {
  keys: string[];
  description: string;
  category: string;
}

const SHORTCUTS: ShortcutItem[] = [
  // Selection
  { keys: ['Click + Drag'], description: 'Select multiple units', category: 'Selection' },
  { keys: ['Click Unit'], description: 'Select single unit', category: 'Selection' },
  { keys: ['Ctrl/Cmd', 'A'], description: 'Select all player units', category: 'Selection' },
  { keys: ['D'], description: 'Deselect all', category: 'Selection' },
  { keys: ['Esc'], description: 'Deselect all', category: 'Selection' },
  
  // Control Groups
  { keys: ['Ctrl/Cmd', '1-8'], description: 'Assign units to control group', category: 'Control Groups' },
  { keys: ['1-8'], description: 'Select control group', category: 'Control Groups' },
  
  // Camera
  { keys: ['Mouse Wheel'], description: 'Zoom in/out', category: 'Camera' },
  { keys: ['W', 'A', 'S', 'D'], description: 'Pan camera', category: 'Camera' },
  { keys: ['Arrow Keys'], description: 'Pan camera (alternative)', category: 'Camera' },
  { keys: ['R'], description: 'Reset camera position', category: 'Camera' },
  
  // Formation
  { keys: ['F'], description: 'Cycle formation type', category: 'Formation' },
  { keys: ['Hold F'], description: 'Show formation menu', category: 'Formation' },
  { keys: ['P'], description: 'Toggle patrol mode', category: 'Formation' },
  
  // Game
  { keys: ['Esc'], description: 'Return to menu', category: 'Game' },
  { keys: ['Space'], description: 'Pause/unpause (coming soon)', category: 'Game' },
];

interface KeyboardShortcutsScreenProps {
  onBack: () => void;
}

export function KeyboardShortcutsScreen({ onBack }: KeyboardShortcutsScreenProps) {
  // Group shortcuts by category
  const categories = Array.from(new Set(SHORTCUTS.map(s => s.category)));
  
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 animate-in fade-in duration-300">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-hidden">
        <CardHeader className="border-b border-border">
          <div className="flex items-center gap-3">
            <Keyboard size={32} className="text-primary" />
            <CardTitle className="text-2xl">Keyboard Shortcuts</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {categories.map((category) => (
              <div key={category}>
                <h3 className="text-lg font-bold text-primary mb-3 uppercase tracking-wider">
                  {category}
                </h3>
                <div className="space-y-2">
                  {SHORTCUTS.filter(s => s.category === category).map((shortcut, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-2 px-3 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm text-muted-foreground">
                        {shortcut.description}
                      </span>
                      <div className="flex gap-1">
                        {shortcut.keys.map((key, keyIdx) => (
                          <kbd
                            key={keyIdx}
                            className="px-2 py-1 text-xs font-mono bg-background border border-border rounded shadow-sm"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-8 p-4 bg-primary/10 border border-primary/30 rounded">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Pro Tip:</strong> Use control groups (1-8) to quickly manage your army. 
              Assign your harassment units to group 1, main army to group 2, and support units to group 3 for efficient micro-management.
            </p>
          </div>
        </CardContent>
        <div className="border-t border-border p-4">
          <Button
            onClick={onBack}
            className="w-full orbitron uppercase tracking-wider"
            variant="outline"
          >
            <ArrowLeft className="mr-2" size={20} />
            Back to Menu
          </Button>
        </div>
      </Card>
    </div>
  );
}
