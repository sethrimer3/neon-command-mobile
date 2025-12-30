import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { ArrowLeft, Users, Plus, SignIn, Copy, Check } from '@phosphor-icons/react';
import { LobbyData } from '@/lib/multiplayer';
import { toast } from 'sonner';

interface MultiplayerLobbyScreenProps {
  onBack: () => void;
  onCreateGame: (playerName: string) => Promise<void>;
  onJoinGame: (gameId: string, playerName: string) => Promise<void>;
  lobbies: LobbyData[];
  currentLobby: LobbyData | null;
  isHost: boolean;
  onStartGame: () => void;
  onLeaveGame: () => void;
  onRefreshLobbies: () => void;
}

export function MultiplayerLobbyScreen({
  onBack,
  onCreateGame,
  onJoinGame,
  lobbies,
  currentLobby,
  isHost,
  onStartGame,
  onLeaveGame,
  onRefreshLobbies,
}: MultiplayerLobbyScreenProps) {
  const [playerName, setPlayerName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!currentLobby) {
        onRefreshLobbies();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [currentLobby, onRefreshLobbies]);

  const handleCreateGame = async () => {
    if (!playerName.trim()) {
      toast.error('Please enter your name');
      return;
    }
    await onCreateGame(playerName.trim());
  };

  const handleJoinGame = async (gameId: string) => {
    if (!playerName.trim()) {
      toast.error('Please enter your name');
      return;
    }
    await onJoinGame(gameId, playerName.trim());
  };

  const handleCopyGameId = () => {
    if (currentLobby) {
      navigator.clipboard.writeText(currentLobby.gameId);
      setCopied(true);
      toast.success('Game ID copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (currentLobby) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="orbitron text-2xl">Game Lobby</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Game ID</Label>
              <div className="flex gap-2">
                <Input
                  value={currentLobby.gameId}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  onClick={handleCopyGameId}
                  size="sm"
                  variant="outline"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this ID with your opponent
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                <div>
                  <p className="text-sm font-medium">{currentLobby.hostName}</p>
                  <p className="text-xs text-muted-foreground">Host</p>
                </div>
                <div
                  className="w-8 h-8 rounded border-2"
                  style={{ backgroundColor: currentLobby.hostColor }}
                />
              </div>

              {currentLobby.guestId ? (
                <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{currentLobby.guestName}</p>
                    <p className="text-xs text-muted-foreground">Guest</p>
                  </div>
                  <div
                    className="w-8 h-8 rounded border-2"
                    style={{ backgroundColor: currentLobby.guestColor || '#666' }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center p-8 border-2 border-dashed rounded-lg">
                  <p className="text-sm text-muted-foreground">Waiting for opponent...</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {isHost && currentLobby.guestId && (
                <Button
                  onClick={onStartGame}
                  className="w-full orbitron"
                  variant="default"
                >
                  Start Game
                </Button>
              )}

              {!isHost && currentLobby.guestId && (
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Waiting for host to start...
                  </p>
                </div>
              )}

              <Button
                onClick={onLeaveGame}
                className="w-full orbitron"
                variant="outline"
              >
                Leave Lobby
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
        <CardHeader>
          <CardTitle className="orbitron text-2xl">Online Multiplayer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="space-y-2">
            <Label>Your Name</Label>
            <Input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
            />
          </div>

          {!showCreate ? (
            <>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowCreate(true)}
                  className="flex-1 orbitron"
                  variant="default"
                  disabled={!playerName.trim()}
                >
                  <Plus className="mr-2" size={20} />
                  Create Game
                </Button>
                <Button
                  onClick={onRefreshLobbies}
                  className="orbitron"
                  variant="outline"
                >
                  Refresh
                </Button>
              </div>

              <div className="flex-1 min-h-0">
                <Label className="mb-2 block">Available Games</Label>
                <ScrollArea className="h-full border rounded-lg">
                  <div className="p-4 space-y-2">
                    {lobbies.length === 0 ? (
                      <div className="text-center py-8">
                        <Users size={48} className="mx-auto mb-4 opacity-30" />
                        <p className="text-sm text-muted-foreground">
                          No games available. Create one to get started!
                        </p>
                      </div>
                    ) : (
                      lobbies.map((lobby) => (
                        <div
                          key={lobby.gameId}
                          className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                        >
                          <div>
                            <p className="text-sm font-medium">{lobby.hostName}'s Game</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {lobby.gameId.slice(0, 16)}...
                            </p>
                          </div>
                          <Button
                            onClick={() => handleJoinGame(lobby.gameId)}
                            size="sm"
                            variant="default"
                            disabled={!playerName.trim()}
                          >
                            <SignIn className="mr-2" size={16} />
                            Join
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-4 border rounded-lg bg-muted">
                <p className="text-sm mb-2">
                  You're creating a new game. Once created, share the Game ID with your opponent so they can join.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCreateGame}
                  className="flex-1 orbitron"
                  variant="default"
                >
                  Confirm Create
                </Button>
                <Button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 orbitron"
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <Button
            onClick={onBack}
            className="w-full orbitron"
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
