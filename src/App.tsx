import { useEffect, useRef, useState } from 'react';
import { useKV } from '@github/spark/hooks';
import { GameState, COLORS, UnitType, BASE_SIZE_METERS, UNIT_DEFINITIONS } from './lib/types';
import { generateId } from './lib/gameUtils';
import { updateGame } from './lib/simulation';
import { updateAI } from './lib/ai';
import { renderGame } from './lib/renderer';
import { handleTouchStart, handleTouchMove, handleTouchEnd, handleMouseDown, handleMouseMove, handleMouseUp, getActiveSelectionRect } from './lib/input';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Label } from './components/ui/label';
import { Switch } from './components/ui/switch';
import { GameController, Robot, ListChecks, GearSix, ArrowLeft, Flag, MapPin, WifiHigh } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { UnitSelectionScreen } from './components/UnitSelectionScreen';
import { MapSelectionScreen } from './components/MapSelectionScreen';
import { MultiplayerLobbyScreen } from './components/MultiplayerLobbyScreen';
import { getMapById, getValidBasePositions } from './lib/maps';
import { MultiplayerManager, LobbyData } from './lib/multiplayer';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState>(createInitialState());
  const [renderTrigger, setRenderTrigger] = useState(0);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number>(Date.now());
  const multiplayerManagerRef = useRef<MultiplayerManager | null>(null);
  const [multiplayerLobbies, setMultiplayerLobbies] = useState<LobbyData[]>([]);
  const [currentLobby, setCurrentLobby] = useState<LobbyData | null>(null);
  const [userId, setUserId] = useState<string>('');

  const [playerColor, setPlayerColor] = useKV('player-color', COLORS.playerDefault);
  const [enemyColor, setEnemyColor] = useKV('enemy-color', COLORS.enemyDefault);
  const [enabledUnits, setEnabledUnits] = useKV<string[]>('enabled-units', ['marine', 'warrior', 'snaker', 'tank', 'scout', 'artillery', 'medic', 'interceptor']);
  const [unitSlots, setUnitSlots] = useKV<Record<string, UnitType>>('unit-slots', { left: 'marine', up: 'warrior', down: 'snaker' });
  const [selectedMap, setSelectedMap] = useKV('selected-map', 'open');

  const gameState = gameStateRef.current;

  useEffect(() => {
    const initUser = async () => {
      const user = await window.spark.user();
      const uid = user?.id?.toString() || `player_${Date.now()}`;
      setUserId(uid);
      multiplayerManagerRef.current = new MultiplayerManager(uid);
    };
    initUser();
  }, []);

  useEffect(() => {
    if (currentLobby && currentLobby.status === 'playing' && gameState.mode === 'multiplayerLobby') {
      startOnlineGame();
    }
  }, [currentLobby]);

  useEffect(() => {
    gameStateRef.current.settings = {
      playerColor: playerColor || COLORS.playerDefault,
      enemyColor: enemyColor || COLORS.enemyDefault,
      enabledUnits: new Set((enabledUnits || ['marine', 'warrior', 'snaker', 'tank', 'scout', 'artillery', 'medic', 'interceptor']) as UnitType[]),
      unitSlots: (unitSlots || { left: 'marine', up: 'warrior', down: 'snaker' }) as Record<'left' | 'up' | 'down', UnitType>,
      selectedMap: selectedMap || 'open',
    };
    gameStateRef.current.players = gameStateRef.current.players.map((p, i) => ({
      ...p,
      color: i === 0 ? (playerColor || COLORS.playerDefault) : (enemyColor || COLORS.enemyDefault),
    }));
  }, [playerColor, enemyColor, enabledUnits, unitSlots, selectedMap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      if (gameStateRef.current.mode === 'game') {
        updateGame(gameStateRef.current, deltaTime);
        updateAI(gameStateRef.current, deltaTime);
      }

      const selectionRect = getActiveSelectionRect();
      renderGame(ctx, gameStateRef.current, canvas, selectionRect);

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleStart = (e: TouchEvent) => handleTouchStart(e, gameStateRef.current, canvas);
    const handleMove = (e: TouchEvent) => handleTouchMove(e, gameStateRef.current, canvas);
    const handleEnd = (e: TouchEvent) => handleTouchEnd(e, gameStateRef.current, canvas);

    canvas.addEventListener('touchstart', handleStart, { passive: false });
    canvas.addEventListener('touchmove', handleMove, { passive: false });
    canvas.addEventListener('touchend', handleEnd, { passive: false });

    const handleMDown = (e: MouseEvent) => handleMouseDown(e, gameStateRef.current, canvas);
    const handleMMove = (e: MouseEvent) => handleMouseMove(e, gameStateRef.current, canvas);
    const handleMUp = (e: MouseEvent) => handleMouseUp(e, gameStateRef.current, canvas);

    canvas.addEventListener('mousedown', handleMDown);
    canvas.addEventListener('mousemove', handleMMove);
    canvas.addEventListener('mouseup', handleMUp);

    return () => {
      canvas.removeEventListener('touchstart', handleStart);
      canvas.removeEventListener('touchmove', handleMove);
      canvas.removeEventListener('touchend', handleEnd);
      canvas.removeEventListener('mousedown', handleMDown);
      canvas.removeEventListener('mousemove', handleMMove);
      canvas.removeEventListener('mouseup', handleMUp);
    };
  }, []);

  const startGame = (mode: 'ai' | 'player') => {
    gameStateRef.current = createGameState(mode, gameStateRef.current.settings);
    setRenderTrigger(prev => prev + 1);
  };

  const startOnlineGame = () => {
    if (!currentLobby) return;
    const isHost = multiplayerManagerRef.current?.getIsHost() || false;
    gameStateRef.current = createOnlineGameState(currentLobby, isHost);
    setRenderTrigger(prev => prev + 1);
  };

  const returnToMenu = () => {
    if (multiplayerManagerRef.current?.getGameId()) {
      multiplayerManagerRef.current.endGame();
    }
    gameStateRef.current = createInitialState();
    setCurrentLobby(null);
    setRenderTrigger(prev => prev + 1);
  };

  const toggleUnit = (unitType: UnitType) => {
    setEnabledUnits((current) => {
      const currentArray = current || ['marine', 'warrior', 'snaker'];
      return currentArray.includes(unitType) 
        ? currentArray.filter(u => u !== unitType)
        : [...currentArray, unitType];
    });
  };

  const goToSettings = () => {
    gameStateRef.current.mode = 'settings';
    setRenderTrigger(prev => prev + 1);
  };

  const goToUnitSelection = () => {
    gameStateRef.current.mode = 'unitSelection';
    setRenderTrigger(prev => prev + 1);
  };

  const goToMapSelection = () => {
    gameStateRef.current.mode = 'mapSelection';
    setRenderTrigger(prev => prev + 1);
  };

  const goToMultiplayer = () => {
    gameStateRef.current.mode = 'multiplayerLobby';
    refreshLobbies();
    setRenderTrigger(prev => prev + 1);
  };

  const backToMenu = () => {
    gameStateRef.current.mode = 'menu';
    setRenderTrigger(prev => prev + 1);
  };

  const handleMapSelect = (mapId: string) => {
    setSelectedMap(mapId);
    toast.success(`Map changed to ${getMapById(mapId)?.name || mapId}`);
  };

  const handleSurrenderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    const state = gameStateRef.current;
    
    if (now - state.lastSurrenderClickTime > 3000) {
      state.surrenderClicks = 0;
    }
    
    state.surrenderClicks++;
    state.lastSurrenderClickTime = now;
    
    if (state.surrenderClicks >= 5) {
      state.mode = 'victory';
      state.winner = 1;
      toast.error('You surrendered!');
    } else {
      toast.warning(`Click ${5 - state.surrenderClicks} more times to surrender`);
    }
  };

  const handleCanvasSurrenderReset = () => {
    if (gameStateRef.current.surrenderClicks > 0 && gameStateRef.current.surrenderClicks < 5) {
      gameStateRef.current.surrenderClicks = 0;
    }
  };

  const handleSlotChange = (slot: 'left' | 'up' | 'down', unitType: UnitType) => {
    setUnitSlots((current) => ({
      ...(current || { left: 'marine', up: 'warrior', down: 'snaker' }),
      [slot]: unitType,
    }));
  };

  const refreshLobbies = async () => {
    if (!multiplayerManagerRef.current) return;
    const lobbies = await multiplayerManagerRef.current.getAvailableLobbies();
    setMultiplayerLobbies(lobbies);
  };

  const handleCreateGame = async (playerName: string) => {
    if (!multiplayerManagerRef.current) return;
    try {
      const gameId = await multiplayerManagerRef.current.createGame(
        playerName,
        playerColor || COLORS.playerDefault,
        selectedMap || 'open',
        enabledUnits || ['marine', 'warrior', 'snaker']
      );
      const lobby = await multiplayerManagerRef.current.getLobby(gameId);
      setCurrentLobby(lobby);
      toast.success('Game created! Share the Game ID with your opponent.');
      
      const checkInterval = setInterval(async () => {
        const updatedLobby = await multiplayerManagerRef.current?.getLobby(gameId);
        if (updatedLobby) {
          setCurrentLobby(updatedLobby);
          if (updatedLobby.status === 'playing') {
            clearInterval(checkInterval);
          }
        }
      }, 1000);
    } catch (error) {
      toast.error('Failed to create game');
    }
  };

  const handleJoinGame = async (gameId: string, playerName: string) => {
    if (!multiplayerManagerRef.current) return;
    try {
      const success = await multiplayerManagerRef.current.joinGame(
        gameId,
        playerName,
        enemyColor || COLORS.enemyDefault
      );
      if (success) {
        const lobby = await multiplayerManagerRef.current.getLobby(gameId);
        setCurrentLobby(lobby);
        toast.success('Joined game! Waiting for host to start...');
        
        const checkInterval = setInterval(async () => {
          const updatedLobby = await multiplayerManagerRef.current?.getLobby(gameId);
          if (updatedLobby) {
            setCurrentLobby(updatedLobby);
            if (updatedLobby.status === 'playing') {
              clearInterval(checkInterval);
            }
          }
        }, 1000);
      } else {
        toast.error('Failed to join game');
      }
    } catch (error) {
      toast.error('Failed to join game');
    }
  };

  const handleStartMultiplayerGame = async () => {
    if (!multiplayerManagerRef.current) return;
    try {
      await multiplayerManagerRef.current.startGame();
      toast.success('Starting game...');
    } catch (error) {
      toast.error('Failed to start game');
    }
  };

  const handleLeaveGame = async () => {
    if (!multiplayerManagerRef.current) return;
    await multiplayerManagerRef.current.leaveGame();
    setCurrentLobby(null);
    toast.info('Left the lobby');
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background" onClick={handleCanvasSurrenderReset}>
      <canvas ref={canvasRef} className="absolute inset-0" />

      {gameState.mode === 'game' && (
        <Button
          onClick={handleSurrenderClick}
          className="absolute top-4 left-4 orbitron"
          variant="destructive"
          size="sm"
        >
          <Flag className="mr-2" size={16} />
          Surrender {gameState.surrenderClicks > 0 && `(${gameState.surrenderClicks}/5)`}
        </Button>
      )}

      {gameState.mode === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col gap-4 w-80 max-w-[90vw]">
            <h1 className="orbitron text-4xl font-bold text-center text-primary mb-4 tracking-wider uppercase">
              Neon Command
            </h1>
            
            <Button
              onClick={() => startGame('player')}
              disabled
              className="h-14 text-lg orbitron uppercase tracking-wider"
              variant="outline"
            >
              <GameController className="mr-2" size={24} />
              Vs. Player
              <span className="ml-2 text-xs">(Coming Soon)</span>
            </Button>

            <Button
              onClick={() => startGame('ai')}
              className="h-14 text-lg orbitron uppercase tracking-wider"
              variant="default"
            >
              <Robot className="mr-2" size={24} />
              Vs. AI
            </Button>

            <Button
              onClick={goToMultiplayer}
              className="h-14 text-lg orbitron uppercase tracking-wider"
              variant="default"
            >
              <WifiHigh className="mr-2" size={24} />
              Online Multiplayer
            </Button>

            <Button
              onClick={goToMapSelection}
              className="h-14 text-lg orbitron uppercase tracking-wider"
              variant="outline"
            >
              <MapPin className="mr-2" size={24} />
              Map Selection
            </Button>

            <Button
              onClick={goToUnitSelection}
              className="h-14 text-lg orbitron uppercase tracking-wider"
              variant="outline"
            >
              <ListChecks className="mr-2" size={24} />
              Unit Selection
            </Button>

            <Button
              onClick={goToSettings}
              className="h-14 text-lg orbitron uppercase tracking-wider"
              variant="outline"
            >
              <GearSix className="mr-2" size={24} />
              Settings
            </Button>
          </div>
        </div>
      )}

      {gameState.mode === 'settings' && (
        <div className="absolute inset-0 flex items-center justify-center p-4 overflow-auto">
          <Card className="w-96 max-w-full">
            <CardHeader>
              <CardTitle className="orbitron text-2xl">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Player Color</Label>
                <div className="flex gap-2">
                  {[
                    { name: 'Blue', value: 'oklch(0.65 0.25 240)' },
                    { name: 'Cyan', value: 'oklch(0.75 0.18 200)' },
                    { name: 'Green', value: 'oklch(0.70 0.20 140)' },
                    { name: 'Purple', value: 'oklch(0.65 0.25 280)' },
                  ].map((color) => (
                    <button
                      key={color.name}
                      onClick={() => setPlayerColor(color.value)}
                      className="w-12 h-12 rounded border-2 transition-all"
                      style={{
                        backgroundColor: color.value,
                        borderColor: playerColor === color.value ? 'white' : 'transparent',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Enemy Color</Label>
                <div className="flex gap-2">
                  {[
                    { name: 'Red', value: 'oklch(0.62 0.28 25)' },
                    { name: 'Orange', value: 'oklch(0.68 0.22 50)' },
                    { name: 'Pink', value: 'oklch(0.70 0.25 340)' },
                    { name: 'Yellow', value: 'oklch(0.85 0.20 95)' },
                  ].map((color) => (
                    <button
                      key={color.name}
                      onClick={() => setEnemyColor(color.value)}
                      className="w-12 h-12 rounded border-2 transition-all"
                      style={{
                        backgroundColor: color.value,
                        borderColor: enemyColor === color.value ? 'white' : 'transparent',
                      }}
                    />
                  ))}
                </div>
              </div>

              <Button
                onClick={backToMenu}
                className="w-full orbitron"
                variant="outline"
              >
                <ArrowLeft className="mr-2" size={20} />
                Back to Menu
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {gameState.mode === 'unitSelection' && (
        <UnitSelectionScreen
          unitSlots={unitSlots as Record<'left' | 'up' | 'down', UnitType>}
          onSlotChange={handleSlotChange}
          onBack={backToMenu}
          playerColor={playerColor || COLORS.playerDefault}
        />
      )}

      {gameState.mode === 'mapSelection' && (
        <MapSelectionScreen
          selectedMap={selectedMap || 'open'}
          onMapSelect={handleMapSelect}
          onBack={backToMenu}
        />
      )}

      {gameState.mode === 'multiplayerLobby' && (
        <MultiplayerLobbyScreen
          onBack={backToMenu}
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGame}
          lobbies={multiplayerLobbies}
          currentLobby={currentLobby}
          isHost={multiplayerManagerRef.current?.getIsHost() || false}
          onStartGame={handleStartMultiplayerGame}
          onLeaveGame={handleLeaveGame}
          onRefreshLobbies={refreshLobbies}
        />
      )}

      {gameState.mode === 'victory' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <Card className="w-96 max-w-full">
            <CardHeader>
              <CardTitle className="orbitron text-3xl text-center">
                {gameState.winner === 0 ? 'Victory!' : 'Defeat'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center mb-6">
                {gameState.winner === 0 ? 'You destroyed the enemy base!' : 'Your base was destroyed.'}
              </p>
              <Button onClick={returnToMenu} className="w-full orbitron" variant="default">
                Return to Menu
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function createInitialState(): GameState {
  return {
    mode: 'menu',
    vsMode: null,
    units: [],
    bases: [],
    obstacles: [],
    players: [
      { photons: 0, incomeRate: 1, color: COLORS.playerDefault },
      { photons: 0, incomeRate: 1, color: COLORS.enemyDefault },
    ],
    selectedUnits: new Set(),
    elapsedTime: 0,
    lastIncomeTime: 0,
    winner: null,
    settings: {
      playerColor: COLORS.playerDefault,
      enemyColor: COLORS.enemyDefault,
      enabledUnits: new Set(['marine', 'warrior', 'snaker', 'tank', 'scout', 'artillery', 'medic', 'interceptor']),
      unitSlots: { left: 'marine', up: 'warrior', down: 'snaker' },
      selectedMap: 'open',
    },
    surrenderClicks: 0,
    lastSurrenderClickTime: 0,
  };
}

function createGameState(mode: 'ai' | 'player', settings: GameState['settings']): GameState {
  const arenaWidth = window.innerWidth / 20;
  const arenaHeight = window.innerHeight / 20;

  const selectedMapDef = getMapById(settings.selectedMap) || getMapById('open')!;
  const obstacles = selectedMapDef.obstacles;
  const basePositions = getValidBasePositions(arenaWidth, arenaHeight, obstacles);

  return {
    mode: 'game',
    vsMode: mode,
    units: [],
    obstacles: obstacles,
    bases: [
      {
        id: generateId(),
        owner: 0,
        position: basePositions.player,
        hp: 1000,
        maxHp: 1000,
        movementTarget: null,
        isSelected: false,
        laserCooldown: 0,
      },
      {
        id: generateId(),
        owner: 1,
        position: basePositions.enemy,
        hp: 1000,
        maxHp: 1000,
        movementTarget: null,
        isSelected: false,
        laserCooldown: 0,
      },
    ],
    players: [
      { photons: 0, incomeRate: 1, color: settings.playerColor },
      { photons: 0, incomeRate: 1, color: settings.enemyColor },
    ],
    selectedUnits: new Set(),
    elapsedTime: 0,
    lastIncomeTime: 0,
    winner: null,
    settings,
    surrenderClicks: 0,
    lastSurrenderClickTime: 0,
  };
}

function createOnlineGameState(lobby: LobbyData, isHost: boolean): GameState {
  const arenaWidth = window.innerWidth / 20;
  const arenaHeight = window.innerHeight / 20;

  const selectedMapDef = getMapById(lobby.mapId) || getMapById('open')!;
  const obstacles = selectedMapDef.obstacles;
  const basePositions = getValidBasePositions(arenaWidth, arenaHeight, obstacles);

  return {
    mode: 'game',
    vsMode: 'online',
    units: [],
    obstacles: obstacles,
    bases: [
      {
        id: generateId(),
        owner: 0,
        position: basePositions.player,
        hp: 1000,
        maxHp: 1000,
        movementTarget: null,
        isSelected: false,
        laserCooldown: 0,
      },
      {
        id: generateId(),
        owner: 1,
        position: basePositions.enemy,
        hp: 1000,
        maxHp: 1000,
        movementTarget: null,
        isSelected: false,
        laserCooldown: 0,
      },
    ],
    players: [
      { photons: 0, incomeRate: 1, color: isHost ? lobby.hostColor : lobby.guestColor || COLORS.playerDefault },
      { photons: 0, incomeRate: 1, color: isHost ? lobby.guestColor || COLORS.enemyDefault : lobby.hostColor },
    ],
    selectedUnits: new Set(),
    elapsedTime: 0,
    lastIncomeTime: 0,
    winner: null,
    settings: {
      playerColor: isHost ? lobby.hostColor : lobby.guestColor || COLORS.playerDefault,
      enemyColor: isHost ? lobby.guestColor || COLORS.enemyDefault : lobby.hostColor,
      enabledUnits: new Set(lobby.enabledUnits as UnitType[]),
      unitSlots: { left: 'marine', up: 'warrior', down: 'snaker' },
      selectedMap: lobby.mapId,
    },
    surrenderClicks: 0,
    lastSurrenderClickTime: 0,
  };
}

export default App;