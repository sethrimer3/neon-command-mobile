import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { ArrowLeft, MagnifyingGlass, Users, WifiHigh } from '@phosphor-icons/react';

interface OnlineModeScreenProps {
  onBack: () => void;
  onMatchmaking: () => void;
  onCustomGame: () => void;
  onLAN: () => void;
  chessMode: boolean;
  onChessModeChange: (enabled: boolean) => void;
}

export function OnlineModeScreen({
  onBack,
  onMatchmaking,
  onCustomGame,
  onLAN,
  chessMode,
  onChessModeChange,
}: OnlineModeScreenProps) {
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
      <Card className="w-full max-w-md my-auto">
        <CardHeader>
          <CardTitle className="orbitron text-2xl">Online Multiplayer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center mb-6">
            Choose how you want to play online
          </p>

          {/* Chess Mode Toggle */}
          <div className="p-4 rounded-lg border-2 border-border bg-secondary/30">
            <div className="flex items-center justify-between">
              <Label htmlFor="chess-mode-online" className="flex flex-col gap-1">
                <span className="text-base font-semibold">Chess Mode</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Queue 1 move per unit every 10s
                </span>
              </Label>
              <Switch
                id="chess-mode-online"
                checked={chessMode}
                onCheckedChange={onChessModeChange}
              />
            </div>
          </div>

          <Button
            onClick={onMatchmaking}
            className="w-full h-20 text-lg orbitron uppercase tracking-wider"
            variant="default"
          >
            <MagnifyingGlass className="mr-3" size={28} />
            <div className="text-left">
              <div>Matchmaking</div>
              <div className="text-xs opacity-70 normal-case font-normal tracking-normal">
                Find a random opponent
              </div>
            </div>
          </Button>

          <Button
            onClick={onCustomGame}
            className="w-full h-20 text-lg orbitron uppercase tracking-wider"
            variant="default"
          >
            <Users className="mr-3" size={28} />
            <div className="text-left">
              <div>Custom Game</div>
              <div className="text-xs opacity-70 normal-case font-normal tracking-normal">
                Create or join with Game ID
              </div>
            </div>
          </Button>

          <Button
            onClick={onLAN}
            className="w-full h-20 text-lg orbitron uppercase tracking-wider"
            variant="secondary"
          >
            <WifiHigh className="mr-3" size={28} />
            <div className="text-left">
              <div>LAN Multiplayer</div>
              <div className="text-xs opacity-70 normal-case font-normal tracking-normal">
                Play locally without internet
              </div>
            </div>
          </Button>

          <Button
            onClick={onBack}
            className="w-full orbitron mt-4"
            variant="outline"
          >
            <ArrowLeft className="mr-2" size={20} />
            Back to Menu
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
