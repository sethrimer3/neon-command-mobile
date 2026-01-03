import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { ArrowLeft, Copy, Check } from '@phosphor-icons/react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';

interface LANModeScreenProps {
  onBack: () => void;
  onHost: () => Promise<string>;
  onJoin: (peerId: string) => Promise<boolean>;
}

export function LANModeScreen({
  onBack,
  onHost,
  onJoin,
}: LANModeScreenProps) {
  const [mode, setMode] = useState<'select' | 'host' | 'join'>('select');
  const [peerId, setPeerId] = useState('');
  const [hostPeerId, setHostPeerId] = useState('');
  const [joinPeerId, setJoinPeerId] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleHost = async () => {
    setIsLoading(true);
    try {
      const id = await onHost();
      setHostPeerId(id);
      setPeerId(id);
      setMode('host');
      toast.success('LAN host started! Share the Peer ID with another player.');
    } catch (error) {
      console.error('Failed to start host:', error);
      toast.error('Failed to start host. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!joinPeerId.trim()) {
      toast.error('Please enter a Peer ID');
      return;
    }

    setIsLoading(true);
    try {
      const success = await onJoin(joinPeerId.trim());
      if (success) {
        toast.success('Connected to host!');
        setMode('join');
      } else {
        toast.error('Failed to connect. Check the Peer ID and try again.');
      }
    } catch (error) {
      console.error('Failed to join:', error);
      toast.error('Failed to connect. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(hostPeerId);
      setCopied(true);
      toast.success('Peer ID copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy. Please copy manually.');
    }
  };

  if (mode === 'select') {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="orbitron text-2xl">LAN Multiplayer</CardTitle>
            <CardDescription>
              Play with someone on the same network or nearby using peer-to-peer connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleHost}
              className="w-full h-20 text-lg orbitron uppercase tracking-wider"
              variant="default"
              disabled={isLoading}
            >
              <div className="text-left">
                <div>Host Game</div>
                <div className="text-xs opacity-70 normal-case font-normal tracking-normal">
                  Start a game and share your Peer ID
                </div>
              </div>
            </Button>

            <div className="space-y-2">
              <Label htmlFor="peerIdInput">Join Game</Label>
              <Input
                id="peerIdInput"
                placeholder="Enter host's Peer ID"
                value={joinPeerId}
                onChange={(e) => setJoinPeerId(e.target.value)}
                className="font-mono"
                disabled={isLoading}
              />
              <Button
                onClick={handleJoin}
                className="w-full text-lg orbitron uppercase tracking-wider"
                variant="default"
                disabled={isLoading || !joinPeerId.trim()}
              >
                Connect to Host
              </Button>
            </div>

            <Button
              onClick={onBack}
              className="w-full orbitron mt-4"
              variant="outline"
              disabled={isLoading}
            >
              <ArrowLeft className="mr-2" size={20} />
              Back to Menu
            </Button>

            <div className="text-xs text-muted-foreground text-center mt-4 space-y-1">
              <p>LAN multiplayer uses WebRTC for direct peer-to-peer connections.</p>
              <p>Both players should be on the same network or nearby for best results.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'host') {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="orbitron text-2xl">Hosting LAN Game</CardTitle>
            <CardDescription>
              Waiting for a player to connect...
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Your Peer ID (share this with another player)</Label>
              <div className="flex gap-2">
                <Input
                  value={hostPeerId}
                  readOnly
                  className="font-mono"
                />
                <Button
                  onClick={copyToClipboard}
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                >
                  {copied ? <Check size={20} /> : <Copy size={20} />}
                </Button>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-sm text-muted-foreground">
                Share your Peer ID with another player on your network.
                Once they connect, you can start the game from the lobby.
              </p>
            </div>

            <Button
              onClick={onBack}
              className="w-full orbitron"
              variant="outline"
            >
              <ArrowLeft className="mr-2" size={20} />
              Cancel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'join') {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="orbitron text-2xl">Connected!</CardTitle>
            <CardDescription>
              Waiting for host to start the game...
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-sm text-muted-foreground">
                Successfully connected to host. Wait for them to start the game.
              </p>
            </div>

            <Button
              onClick={onBack}
              className="w-full orbitron"
              variant="outline"
            >
              <ArrowLeft className="mr-2" size={20} />
              Disconnect
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
