/**
 * Unit Modifiers Help Screen
 * Explains each modifier type and how it affects gameplay
 */
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, Info } from '@phosphor-icons/react';

interface ModifierInfo {
  name: string;
  description: string;
  icon: string;
  color: string;
  examples: string[];
}

const MODIFIERS: ModifierInfo[] = [
  {
    name: 'Melee',
    description: 'Close-range combat units that ignore enemy armor. Must get close to attack but deal full damage regardless of armor value.',
    icon: '⚔️',
    color: 'text-red-500',
    examples: ['Blade', 'Berserker', 'Assassin', 'Juggernaut', 'Striker', 'Nova'],
  },
  {
    name: 'Ranged',
    description: 'Long-range combat units that are affected by enemy armor. Can attack from a distance but damage is reduced by target armor.',
    icon: '🏹',
    color: 'text-blue-500',
    examples: ['Marine', 'Tank', 'Scout', 'Artillery', 'Interceptor', 'Flare', 'Eclipse', 'Corona', 'Supernova'],
  },
  {
    name: 'Flying',
    description: 'Airborne units that can only be hit by ability attacks, not by normal attacks. Regular units cannot target flying units.',
    icon: '✈️',
    color: 'text-cyan-500',
    examples: ['Interceptor'],
  },
  {
    name: 'Small',
    description: 'Compact units that are vulnerable to area damage. Takes double damage from splash attacks like Bombardment, but still protected by armor against melee.',
    icon: '🐜',
    color: 'text-yellow-500',
    examples: ['Snaker', 'Scout', 'Flare'],
  },
  {
    name: 'Healing',
    description: 'Support units that do not attack but can heal friendly units. These units are essential for sustaining your army.',
    icon: '⚕️',
    color: 'text-green-500',
    examples: ['Medic'],
  },
];

interface ModifierHelpScreenProps {
  onBack: () => void;
}

export function ModifierHelpScreen({ onBack }: ModifierHelpScreenProps) {
  return (
    <div className="absolute inset-0 overflow-y-auto animate-in fade-in duration-300">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
      <Card className="w-full max-w-4xl overflow-hidden my-auto">
        <CardHeader className="border-b border-border">
          <div className="flex items-center gap-3">
            <Info size={32} className="text-primary" />
            <CardTitle className="text-2xl">Unit Modifiers Guide</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg">
              <h3 className="text-lg font-bold mb-2">Armor System</h3>
              <p className="text-sm text-muted-foreground">
                All units and bases have an <strong className="text-foreground">armor</strong> value that reduces damage from ranged attacks. 
                Melee attacks ignore armor completely. Armor effectiveness follows the formula: <code className="px-1 py-0.5 bg-background rounded">reduction = armor / (armor + 100)</code>
              </p>
            </div>

            {MODIFIERS.map((modifier, idx) => (
              <div
                key={idx}
                className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className={`text-4xl ${modifier.color}`}>
                    {modifier.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-xl font-bold ${modifier.color} mb-2`}>
                      {modifier.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {modifier.description}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs font-semibold text-foreground">Examples:</span>
                      {modifier.examples.map((example, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 text-xs bg-background border border-border rounded"
                        >
                          {example}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="p-4 bg-muted/30 border border-border rounded-lg">
              <h3 className="text-lg font-bold mb-2">Strategic Tips</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Use <strong className="text-foreground">melee</strong> units to counter heavily armored targets since they ignore armor.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span><strong className="text-foreground">Flying</strong> units are immune to normal attacks, so you'll need abilities to counter them.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Area-of-effect abilities like Bombardment are extra effective against <strong className="text-foreground">small</strong> units.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Protect your <strong className="text-foreground">healing</strong> units as they keep your army in the fight longer.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Balance your army composition with a mix of melee and ranged units for maximum effectiveness.</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
        <div className="border-t border-border p-4 bg-card">
          <Button
            onClick={onBack}
            className="w-full sm:w-auto"
            variant="default"
          >
            <ArrowLeft className="mr-2" size={20} />
            Back
          </Button>
        </div>
      </Card>
      </div>
    </div>
  );
}
