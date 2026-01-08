/**
 * Comprehensive Tutorial Screen
 * Explains all basic controls and mechanics of the game
 */
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, GameController, MouseSimple, HandSwipeRight, Target, Lightning, Shield, Flag, ChartLine, Users, KeyReturn, TrendUp } from '@phosphor-icons/react';
import { ScrollArea } from './ui/scroll-area';

interface TutorialScreenProps {
  onBack: () => void;
}

interface TutorialSection {
  icon: React.ReactNode;
  title: string;
  content: string[];
}

export function TutorialScreen({ onBack }: TutorialScreenProps) {
  const sections: TutorialSection[] = [
    {
      icon: <Target size={32} className="text-primary" />,
      title: "Game Objective",
      content: [
        "The goal is to destroy your opponent's base while protecting your own.",
        "You earn photons (energy) over time to train units.",
        "Use your units strategically to overwhelm the enemy defenses.",
        "First player to destroy the enemy base wins!"
      ]
    },
    {
      icon: <MouseSimple size={32} className="text-blue-400" />,
      title: "Desktop Controls",
      content: [
        "Click and drag: Select multiple units with a selection rectangle",
        "Click on unit: Select a single unit",
        "Right-click or click empty space: Move selected units to location",
        "Click and drag from unit: Cast unit's special ability in that direction",
        "Mouse wheel: Zoom in/out (if camera controls enabled)",
        "WASD or Arrow keys: Pan the camera around the battlefield",
        "R key: Reset camera to default position",
        "ESC key: Deselect units or return to menu",
        "Ctrl/Cmd + A: Select all your units",
        "Ctrl/Cmd + Number (1-8): Assign selected units to control group",
        "Number key (1-8): Select control group",
        "F key: Cycle through formation types (line, spread, cluster, wedge, circle)",
        "P key (hold): Enable patrol mode for movement commands"
      ]
    },
    {
      icon: <HandSwipeRight size={32} className="text-cyan-400" />,
      title: "Mobile/Touch Controls",
      content: [
        "Tap and drag: Select multiple units with a selection rectangle",
        "Tap on unit: Select a single unit",
        "Tap empty space: Move selected units to location",
        "Swipe from unit: Cast unit's special ability in swipe direction",
        "Pinch gesture: Zoom in/out (if camera controls enabled)",
        "Two-finger drag: Pan the camera around the battlefield"
      ]
    },
    {
      icon: <Lightning size={32} className="text-yellow-400" />,
      title: "Spawning Units",
      content: [
        "Select your base by clicking/tapping on it (the glowing square in your color)",
        "When base is selected, swipe or drag in different directions to spawn units:",
        "• Left swipe: Spawn unit in left slot",
        "• Up swipe: Spawn unit in up slot", 
        "• Down swipe: Spawn unit in down slot",
        "• Right swipe: Spawn unit in right slot",
        "Each unit type costs photons - you must have enough to spawn",
        "Units automatically move to the rally point after spawning",
        "Configure which units are in each slot via Unit Selection menu"
      ]
    },
    {
      icon: <Shield size={32} className="text-green-400" />,
      title: "Base Laser Ability",
      content: [
        "Your base has a powerful laser attack on cooldown",
        "To use it: Select your base → Click to set a movement target → Swipe from the target dot",
        "The laser fires in a straight line dealing massive damage:",
        "• 200 damage to units",
        "• 300 damage to enemy bases",
        "10-second cooldown between uses",
        "Great for defending against large pushes or finishing off the enemy base"
      ]
    },
    {
      icon: <ChartLine size={32} className="text-purple-400" />,
      title: "Unit Abilities & Combat",
      content: [
        "Each unit has a unique special ability - check Unit Guide for details",
        "To cast ability: Select unit(s) → Drag/swipe in a direction",
        "Most abilities have cooldowns and cost resources",
        "Units have two main attack types:",
        "• Melee attacks: Ignore enemy armor, must be close",
        "• Ranged attacks: Can attack from distance, reduced by armor",
        "Some units have special modifiers:",
        "• Flying units can only be hit by abilities",
        "• Small units take double damage from area attacks",
        "• Healing units don't attack but heal nearby allies"
      ]
    },
    {
      icon: <TrendUp size={32} className="text-orange-400" />,
      title: "Distance Promotion System",
      content: [
        "Units gain damage bonuses as they travel long distances",
        "For every 10 meters traveled, units get +10% damage multiplier",
        "The multiplier is displayed beneath the unit",
        "Queue bonus: Each command in queue adds +10% to distance credit",
        "Strategy: Plan long flanking maneuvers to maximize unit strength",
        "Promoted units can turn the tide of battle!"
      ]
    },
    {
      icon: <Target size={32} className="text-red-400" />,
      title: "Command Queue & Telegraphing",
      content: [
        "All unit movements and abilities are telegraphed - both players can see them!",
        "Your commands appear as glowing paths in your team color",
        "Enemy commands appear in their team color",
        "Units can queue up to 3 commands",
        "Commands are executed in order",
        "If a unit dies, its command queue is cleared",
        "This creates strategic depth - you can predict and counter enemy moves"
      ]
    },
    {
      icon: <Users size={32} className="text-pink-400" />,
      title: "Unit Selection & Formations",
      content: [
        "You can select individual units or groups",
        "Selected units have a highlight glow",
        "Press F to cycle through formation types:",
        "• None: Units move independently",
        "• Line: Units form a battle line",
        "• Spread: Units spread out to avoid AOE",
        "• Cluster: Units group tightly together",
        "• Wedge: Units form a spearhead formation",
        "• Circle: Units surround a center point",
        "Formations affect how units position during movement"
      ]
    },
    {
      icon: <Flag size={32} className="text-rose-400" />,
      title: "Surrendering & Victory",
      content: [
        "To surrender: Click the surrender button 5 times (prevents accidental surrenders)",
        "Click anywhere else to cancel the surrender attempt",
        "Victory is achieved by destroying the enemy base",
        "Matches have a 5-minute time limit - longest standing base wins",
        "30-second warning appears when time is running low",
        "Match statistics are recorded after each game"
      ]
    },
    {
      icon: <KeyReturn size={32} className="text-indigo-400" />,
      title: "Strategic Tips",
      content: [
        "Economy: Collect photons from mining depots in the corners for bonus income",
        "Composition: Mix melee and ranged units for balanced army",
        "Scouting: Use fast/cloaked Dagger units to see enemy movements",
        "Abilities: Save powerful abilities for key moments",
        "Positioning: Use terrain obstacles for cover and flanking",
        "Camera: Pan and zoom to maintain battlefield awareness",
        "Control Groups: Organize units into groups for faster control",
        "Rally Points: Set base rally points near forward positions",
        "Distance Bonus: Plan long routes to maximize damage multipliers"
      ]
    }
  ];

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* 50% transparent black overlay */}
      <div className="absolute inset-0 bg-black opacity-50 pointer-events-none" />
      
      <div className="absolute inset-0 overflow-y-auto animate-in fade-in duration-300">
        <div className="min-h-full flex items-start justify-center p-4 py-8">
          <Card className="w-full max-w-4xl overflow-hidden my-auto">
            <CardHeader className="border-b border-border sticky top-0 bg-card z-10">
              <div className="flex items-center gap-3">
                <GameController size={32} className="text-primary" />
                <CardTitle className="text-2xl orbitron">Game Tutorial</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Learn all the essential controls and mechanics to master Speed of Light RTS
              </p>
            </CardHeader>
            
            <CardContent className="p-6">
              <ScrollArea className="h-[calc(100vh-16rem)] pr-4">
                <div className="space-y-6">
                  {sections.map((section, idx) => (
                    <div
                      key={idx}
                      className="border border-border rounded-lg p-5 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start gap-4 mb-4">
                        <div className="flex-shrink-0">
                          {section.icon}
                        </div>
                        <h3 className="text-xl font-bold text-foreground">
                          {section.title}
                        </h3>
                      </div>
                      <div className="space-y-2 ml-12">
                        {section.content.map((text, i) => (
                          <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                            {text}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg">
                    <h3 className="text-lg font-bold mb-2 text-primary orbitron">Ready to Play?</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Now that you understand the basics, jump into a Quick Match or explore the Level Selection to practice against AI opponents. 
                      Don't forget to check out the Unit Guide and Unit Information screens to learn about each unit's capabilities!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Remember: All movement is telegraphed to both players, so always think ahead and adapt to your opponent's strategy!
                    </p>
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
            
            <div className="border-t border-border p-4 bg-card">
              <Button
                onClick={onBack}
                className="w-full sm:w-auto orbitron"
                variant="default"
              >
                <ArrowLeft className="mr-2" size={20} />
                Back to Menu
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
