import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ArrowLeft, MagnifyingGlass, Users, WifiHigh } from '@phosphor-icons/react';

interface OnlineModeScreenProps {
  onBack: () => void;
  onMatchmaking: () => void;
  onCustomGame: () => void;
  onLAN: () => void;
}

export function OnlineModeScreen({
  onBack,
  onMatchmaking,
  onCustomGame,
  onLAN,
}: OnlineModeScreenProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="orbitron text-2xl">Online Multiplayer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center mb-6">
            Choose how you want to play online
          </p>

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
  );
}
