import { useEffect, useRef, useState, useCallback } from 'react';
import { useKV } from './hooks/useKV';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { GameState, COLORS, UnitType, BASE_SIZE_METERS, UNIT_DEFINITIONS } from './lib/types';
import { generateId, generateTopographyLines, generateStarfield, generateNebulaClouds, isPortraitOrientation } from './lib/gameUtils';
import { updateGame } from './lib/simulation';
import { updateAI } from './lib/ai';
import { renderGame } from './lib/renderer';
import { handleTouchStart, handleTouchMove, handleTouchEnd, handleMouseDown, handleMouseMove, handleMouseUp, getActiveSelectionRect } from './lib/input';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Label } from './components/ui/label';
import { Switch } from './components/ui/switch';
import { Slider } from './components/ui/slider';
import { GameController, Robot, ListChecks, GearSix, ArrowLeft, Flag, MapPin, WifiHigh, ChartBar, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { UnitSelectionScreen } from './components/UnitSelectionScreen';
import { MapSelectionScreen } from './components/MapSelectionScreen';
import { LevelSelectionScreen } from './components/LevelSelectionScreen';
import { OnlineModeScreen } from './components/OnlineModeScreen';
import { MultiplayerLobbyScreen } from './components/MultiplayerLobbyScreen';
import { StatisticsScreen } from './components/StatisticsScreen';
import { getMapById, getValidBasePositions } from './lib/maps';
import { MultiplayerManager, LobbyData } from './lib/multiplayer';
import { PlayerStatistics, MatchStats, createEmptyStatistics, updateStatistics, calculateMMRChange } from './lib/statistics';
import { soundManager } from './lib/sound';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState>(createInitialState());
  const [renderTrigger, setRenderTrigger] = useState(0);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number>(Date.now());
  const multiplayerManagerRef = useRef<MultiplayerManager | null>(null);
  const lobbyCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [multiplayerLobbies, setMultiplayerLobbies] = useState<LobbyData[]>([]);
  const [currentLobby, setCurrentLobby] = useState<LobbyData | null>(null);
  const [userId, setUserId] = useState<string>('');

  const [playerColor, setPlayerColor] = useKV('player-color', COLORS.playerDefault);
  const [enemyColor, setEnemyColor] = useKV('enemy-color', COLORS.enemyDefault);
  const [enabledUnits, setEnabledUnits] = useKV<string[]>('enabled-units', ['marine', 'warrior', 'snaker', 'tank', 'scout', 'artillery', 'medic', 'interceptor']);
  const [unitSlots, setUnitSlots] = useKV<Record<string, UnitType>>('unit-slots', { left: 'marine', up: 'warrior', down: 'snaker', right: 'tank' });
  const [selectedMap, setSelectedMap] = useKV('selected-map', 'open');
  const [playerStatistics, setPlayerStatistics] = useKV<PlayerStatistics>('player-statistics', createEmptyStatistics());
  const [soundEnabled, setSoundEnabled] = useKV<boolean>('sound-enabled', true);
  const [sfxVolume, setSfxVolume] = useKV<number>('sfx-volume', 0.7);
  const [musicVolume, setMusicVolume] = useKV<number>('music-volume', 0.5);
  const [showNumericHP, setShowNumericHP] = useKV<boolean>('show-numeric-hp', true);
  const [showMinimap, setShowMinimap] = useKV<boolean>('show-minimap', true);

  const gameState = gameStateRef.current;

  useEffect(() => {
    const initUser = async () => {
      let uid = `player_${Date.now()}`;
      if (typeof window !== 'undefined' && window.spark?.user) {
        try {
          const user = await window.spark.user();
          uid = user?.id?.toString() || uid;
        } catch (error) {
          console.warn('Failed to fetch spark user, using fallback ID:', error);
        }
      }
      setUserId(uid);
      multiplayerManagerRef.current = new MultiplayerManager(uid);
    };
    initUser();
    soundManager.setEnabled(soundEnabled ?? true);
    soundManager.setSfxVolume(sfxVolume ?? 0.7);
    soundManager.setMusicVolume(musicVolume ?? 0.5);
  }, []);

  useEffect(() => {
    soundManager.setEnabled(soundEnabled ?? true);
  }, [soundEnabled]);

  useEffect(() => {
    soundManager.setSfxVolume(sfxVolume ?? 0.7);
  }, [sfxVolume]);

  useEffect(() => {
    soundManager.setMusicVolume(musicVolume ?? 0.5);
  }, [musicVolume]);

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
      unitSlots: (unitSlots || { left: 'marine', up: 'warrior', down: 'snaker', right: 'tank' }) as Record<'left' | 'up' | 'down' | 'right', UnitType>,
      selectedMap: selectedMap || 'open',
      showNumericHP: showNumericHP ?? true,
    };
    gameStateRef.current.showMinimap = showMinimap ?? true;
    gameStateRef.current.players = gameStateRef.current.players.map((p, i) => ({
      ...p,
      color: i === 0 ? (playerColor || COLORS.playerDefault) : (enemyColor || COLORS.enemyDefault),
    }));
  }, [playerColor, enemyColor, enabledUnits, unitSlots, selectedMap, showNumericHP, showMinimap]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (lobbyCheckIntervalRef.current) {
        clearInterval(lobbyCheckIntervalRef.current);
        lobbyCheckIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const detectOrientation = () => {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                        ('ontouchstart' in window) || 
                        (window.innerWidth < 768);
      
      gameStateRef.current.isMobile = isMobile;
      gameStateRef.current.isPortrait = isPortraitOrientation();
    };

    const resizeCanvas = () => {
      detectOrientation();
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);

    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      // Update FPS counter
      if (!gameStateRef.current.lastFpsUpdate) {
        gameStateRef.current.lastFpsUpdate = now;
        gameStateRef.current.frameCount = 0;
        gameStateRef.current.fps = 60;
      }
      gameStateRef.current.frameCount = (gameStateRef.current.frameCount || 0) + 1;
      if (now - gameStateRef.current.lastFpsUpdate >= 1000) {
        gameStateRef.current.fps = gameStateRef.current.frameCount;
        gameStateRef.current.frameCount = 0;
        gameStateRef.current.lastFpsUpdate = now;
      }

      if (gameStateRef.current.mode === 'countdown') {
        const elapsed = now - (gameStateRef.current.countdownStartTime || now);
        const secondsRemaining = Math.ceil(3 - elapsed / 1000);
        const prevSeconds = Math.ceil(3 - (elapsed - 16.67) / 1000);
        
        if (secondsRemaining !== prevSeconds && secondsRemaining > 0) {
          soundManager.playCountdown();
        }
        
        if (elapsed >= 3000) {
          gameStateRef.current.mode = 'game';
          gameStateRef.current.matchStartAnimation = {
            startTime: now,
            phase: 'bases-sliding',
          };
          soundManager.playMatchStart();
          delete gameStateRef.current.countdownStartTime;
          setRenderTrigger(prev => prev + 1);
        }
      }

      if (gameStateRef.current.mode === 'game') {
        const anim = gameStateRef.current.matchStartAnimation;
        if (anim) {
          const animElapsed = now - anim.startTime;
          if (anim.phase === 'bases-sliding' && animElapsed >= 1500) {
            anim.phase = 'go';
          } else if (anim.phase === 'go' && animElapsed >= 2500) {
            delete gameStateRef.current.matchStartAnimation;
          }
        }

        if (!gameStateRef.current.matchStartAnimation || (gameStateRef.current.matchStartAnimation.phase === 'go')) {
          updateGame(gameStateRef.current, deltaTime);
          updateAI(gameStateRef.current, deltaTime);
        }
        
        if (gameStateRef.current.matchTimeLimit && !gameStateRef.current.timeoutWarningShown) {
          const timeRemaining = gameStateRef.current.matchTimeLimit - gameStateRef.current.elapsedTime;
          if (timeRemaining <= 30 && timeRemaining > 29) {
            gameStateRef.current.timeoutWarningShown = true;
            toast.warning('30 seconds remaining!', {
              duration: 3000,
            });
          }
        }
      }

      const selectionRect = getActiveSelectionRect();
      renderGame(ctx, gameStateRef.current, canvas, selectionRect);

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('orientationchange', resizeCanvas);
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

  const startGame = (mode: 'ai' | 'player', mapId?: string) => {
    soundManager.playButtonClick();
    if (!canvasRef.current) return;
    const finalMapId = mapId || gameStateRef.current.settings.selectedMap;
    gameStateRef.current = createCountdownState(mode, { ...gameStateRef.current.settings, selectedMap: finalMapId }, canvasRef.current);
    setRenderTrigger(prev => prev + 1);
  };

  const startOnlineGame = () => {
    if (!currentLobby || !canvasRef.current) return;
    const isHost = multiplayerManagerRef.current?.getIsHost() || false;
    gameStateRef.current = createOnlineCountdownState(currentLobby, isHost, canvasRef.current);
    setRenderTrigger(prev => prev + 1);
  };

  const returnToMenu = (recordMatch: boolean = false, result?: 'victory' | 'defeat' | 'surrender' | 'draw') => {
    if (result === 'victory') {
      soundManager.playVictory();
    } else if (result === 'defeat') {
      soundManager.playDefeat();
    }
    
    if (recordMatch && result && gameStateRef.current.matchStats && gameStateRef.current.vsMode) {
      const duration = (Date.now() - gameStateRef.current.matchStats.startTime) / 1000;
      
      setPlayerStatistics((currentStats) => {
        const stats = currentStats || createEmptyStatistics();
        
        let mmrChange = 0;
        let opponentMMR = 1000;
        let playerMMRBefore = stats.mmr;
        let playerMMRAfter = stats.mmr;
        
        if (gameStateRef.current.vsMode === 'online' && result !== 'surrender') {
          if (result === 'draw') {
            mmrChange = calculateMMRChange(stats.mmr, opponentMMR, 'draw');
          } else {
            mmrChange = calculateMMRChange(stats.mmr, opponentMMR, result);
          }
          playerMMRAfter = stats.mmr + mmrChange;
        }
        
        const newMatch: MatchStats = {
          matchId: generateId(),
          timestamp: Date.now(),
          result,
          vsMode: gameStateRef.current.vsMode!,
          opponentName: gameStateRef.current.vsMode === 'ai' ? 'AI' : undefined,
          opponentMMR: gameStateRef.current.vsMode === 'online' ? opponentMMR : undefined,
          mapId: gameStateRef.current.settings.selectedMap,
          duration,
          unitsTrainedByPlayer: gameStateRef.current.matchStats!.unitsTrainedByPlayer,
          unitsKilledByPlayer: gameStateRef.current.matchStats!.unitsKilledByPlayer,
          damageDealtByPlayer: gameStateRef.current.matchStats!.damageDealtByPlayer,
          photonsSpentByPlayer: gameStateRef.current.matchStats!.photonsSpentByPlayer,
          basesDestroyedByPlayer: result === 'victory' ? 1 : 0,
          finalPlayerColor: gameStateRef.current.settings.playerColor,
          finalEnemyColor: gameStateRef.current.settings.enemyColor,
          mmrChange: gameStateRef.current.vsMode === 'online' && result !== 'surrender' ? mmrChange : undefined,
          playerMMRBefore: gameStateRef.current.vsMode === 'online' && result !== 'surrender' ? playerMMRBefore : undefined,
          playerMMRAfter: gameStateRef.current.vsMode === 'online' && result !== 'surrender' ? playerMMRAfter : undefined,
          timeoutResult: duration >= 295,
        };
        
        if (gameStateRef.current.vsMode === 'online' && result !== 'surrender') {
          if (result === 'draw') {
            toast.info(`Draw! MMR ${mmrChange >= 0 ? '+' : ''}${mmrChange}`);
          } else {
            toast.success(`Match saved! MMR ${mmrChange >= 0 ? '+' : ''}${mmrChange}`);
          }
        } else {
          toast.success('Match statistics saved!');
        }
        
        return updateStatistics(stats, newMatch);
      });
    }
    
    // Clear the lobby check interval
    if (lobbyCheckIntervalRef.current) {
      clearInterval(lobbyCheckIntervalRef.current);
      lobbyCheckIntervalRef.current = null;
    }
    
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
    soundManager.playButtonClick();
    gameStateRef.current.mode = 'settings';
    setRenderTrigger(prev => prev + 1);
  };

  const goToUnitSelection = () => {
    soundManager.playButtonClick();
    gameStateRef.current.mode = 'unitSelection';
    setRenderTrigger(prev => prev + 1);
  };

  const goToMapSelection = () => {
    soundManager.playButtonClick();
    gameStateRef.current.mode = 'mapSelection';
    setRenderTrigger(prev => prev + 1);
  };

  const goToLevelSelection = () => {
    soundManager.playButtonClick();
    gameStateRef.current.mode = 'levelSelection';
    setRenderTrigger(prev => prev + 1);
  };

  const goToOnlineMode = () => {
    soundManager.playButtonClick();
    gameStateRef.current.mode = 'onlineMode';
    setRenderTrigger(prev => prev + 1);
  };

  const goToMultiplayer = () => {
    soundManager.playButtonClick();
    gameStateRef.current.mode = 'multiplayerLobby';
    refreshLobbies();
    setRenderTrigger(prev => prev + 1);
  };

  const goToMatchmaking = () => {
    soundManager.playButtonClick();
    toast.info('Matchmaking coming soon!');
    // TODO: Implement matchmaking logic
  };

  const backToMenu = () => {
    soundManager.playButtonClick();
    gameStateRef.current.mode = 'menu';
    setRenderTrigger(prev => prev + 1);
  };

  const goToStatistics = () => {
    soundManager.playButtonClick();
    gameStateRef.current.mode = 'statistics';
    setRenderTrigger(prev => prev + 1);
  };

  const handleMapSelect = (mapId: string) => {
    setSelectedMap(mapId);
    toast.success(`Map changed to ${getMapById(mapId)?.name || mapId}`);
  };

  const handleLevelSelect = (mapId: string) => {
    soundManager.playButtonClick();
    setSelectedMap(mapId);
    startGame('ai', mapId);
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
    state.surrenderExpanded = true;
    
    if (state.surrenderClicks >= 5) {
      returnToMenu(true, 'surrender');
      toast.error('You surrendered!');
    } else {
      toast.warning(`Click ${5 - state.surrenderClicks} more times to surrender`);
    }
    
    setRenderTrigger(prev => prev + 1);
  };

  const handleCanvasSurrenderReset = () => {
    if (gameStateRef.current.surrenderClicks > 0 && gameStateRef.current.surrenderClicks < 5) {
      gameStateRef.current.surrenderClicks = 0;
      gameStateRef.current.surrenderExpanded = false;
      setRenderTrigger(prev => prev + 1);
    }
  };

  const handleSlotChange = (slot: 'left' | 'up' | 'down' | 'right', unitType: UnitType) => {
    setUnitSlots((current) => ({
      ...(current || { left: 'marine', up: 'warrior', down: 'snaker', right: 'tank' }),
      [slot]: unitType,
    }));
  };

  const refreshLobbies = useCallback(async () => {
    if (!multiplayerManagerRef.current) return;
    const lobbies = await multiplayerManagerRef.current.getAvailableLobbies();
    setMultiplayerLobbies(lobbies);
  }, []);

  const handleCreateGame = async (playerName: string) => {
    if (!multiplayerManagerRef.current) return;
    try {
      // Clear any existing interval
      if (lobbyCheckIntervalRef.current) {
        clearInterval(lobbyCheckIntervalRef.current);
        lobbyCheckIntervalRef.current = null;
      }
      
      const gameId = await multiplayerManagerRef.current.createGame(
        playerName,
        playerColor || COLORS.playerDefault,
        selectedMap || 'open',
        enabledUnits || ['marine', 'warrior', 'snaker']
      );
      const lobby = await multiplayerManagerRef.current.getLobby(gameId);
      setCurrentLobby(lobby);
      toast.success('Game created! Share the Game ID with your opponent.');
      
      lobbyCheckIntervalRef.current = setInterval(async () => {
        const updatedLobby = await multiplayerManagerRef.current?.getLobby(gameId);
        if (updatedLobby) {
          setCurrentLobby(updatedLobby);
          if (updatedLobby.status === 'playing') {
            if (lobbyCheckIntervalRef.current) {
              clearInterval(lobbyCheckIntervalRef.current);
              lobbyCheckIntervalRef.current = null;
            }
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
      // Clear any existing interval
      if (lobbyCheckIntervalRef.current) {
        clearInterval(lobbyCheckIntervalRef.current);
        lobbyCheckIntervalRef.current = null;
      }
      
      const success = await multiplayerManagerRef.current.joinGame(
        gameId,
        playerName,
        enemyColor || COLORS.enemyDefault
      );
      if (success) {
        const lobby = await multiplayerManagerRef.current.getLobby(gameId);
        setCurrentLobby(lobby);
        toast.success('Joined game! Waiting for host to start...');
        
        lobbyCheckIntervalRef.current = setInterval(async () => {
          const updatedLobby = await multiplayerManagerRef.current?.getLobby(gameId);
          if (updatedLobby) {
            setCurrentLobby(updatedLobby);
            if (updatedLobby.status === 'playing') {
              if (lobbyCheckIntervalRef.current) {
                clearInterval(lobbyCheckIntervalRef.current);
                lobbyCheckIntervalRef.current = null;
              }
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
    // Clear the lobby check interval
    if (lobbyCheckIntervalRef.current) {
      clearInterval(lobbyCheckIntervalRef.current);
      lobbyCheckIntervalRef.current = null;
    }
    await multiplayerManagerRef.current.leaveGame();
    setCurrentLobby(null);
    toast.info('Left the lobby');
  };
  
  // Keyboard controls for desktop
  useKeyboardControls({
    onEscape: () => {
      if (gameState.mode === 'game') {
        // Deselect all units
        gameStateRef.current.selectedUnits.clear();
        gameStateRef.current.bases.forEach(b => b.isSelected = false);
        setRenderTrigger(prev => prev + 1);
      } else if (gameState.mode !== 'menu') {
        backToMenu();
      }
    },
    onSelectAll: () => {
      if (gameState.mode === 'game') {
        // Select all player units
        gameStateRef.current.selectedUnits.clear();
        gameStateRef.current.units
          .filter(u => u.owner === 0)
          .forEach(u => gameStateRef.current.selectedUnits.add(u.id));
        setRenderTrigger(prev => prev + 1);
        soundManager.playButtonClick();
      }
    },
    onDeselect: () => {
      if (gameState.mode === 'game') {
        gameStateRef.current.selectedUnits.clear();
        gameStateRef.current.bases.forEach(b => b.isSelected = false);
        setRenderTrigger(prev => prev + 1);
      }
    },
  }, gameState.mode === 'game' || gameState.mode !== 'menu');

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background" onClick={handleCanvasSurrenderReset}>
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 transition-opacity duration-300"
      />

      {gameState.mode === 'game' && (
        <Button
          onClick={handleSurrenderClick}
          className={`absolute top-4 left-4 orbitron transition-all duration-300 overflow-hidden animate-in fade-in slide-in-from-left-2 ${
            gameState.surrenderExpanded ? 'w-48' : 'w-12'
          }`}
          variant="destructive"
          size="sm"
        >
          <Flag className={gameState.surrenderExpanded ? "mr-2" : ""} size={16} />
          {gameState.surrenderExpanded && (
            <span className="whitespace-nowrap">
              Surrender? ({5 - gameState.surrenderClicks})
            </span>
          )}
        </Button>
      )}

      {gameState.mode === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="text-center animate-in slide-in-from-bottom-4 duration-500">
            <h2 className="orbitron text-3xl font-bold mb-8 text-primary animate-in slide-in-from-top duration-500 delay-150">
              {getMapById(gameState.settings.selectedMap)?.name || 'Map Preview'}
            </h2>
            <div className="orbitron text-8xl font-black text-foreground neon-glow" style={{
              textShadow: '0 0 30px currentColor, 0 0 60px currentColor'
            }}>
              {Math.ceil(3 - (Date.now() - (gameState.countdownStartTime || Date.now())) / 1000)}
            </div>
          </div>
        </div>
      )}

      {gameState.mode === 'game' && gameState.matchStartAnimation?.phase === 'go' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="orbitron text-9xl font-black text-primary animate-in zoom-in-95 fade-in duration-500" style={{
            textShadow: '0 0 40px currentColor, 0 0 80px currentColor'
          }}>
            GO!
          </div>
        </div>
      )}

      {gameState.mode === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center animate-in fade-in duration-500">
          <div className="absolute top-4 left-4 orbitron text-sm text-muted-foreground opacity-70">
            Build 1
          </div>
          <div className="flex flex-col gap-4 w-80 max-w-[90vw]">
            <h1 className="orbitron text-4xl font-bold text-center text-primary mb-4 tracking-wider uppercase animate-in fade-in zoom-in-95 duration-700 neon-glow" style={{
              textShadow: '0 0 20px currentColor'
            }}>
              Speed of Light RTS
            </h1>

            <Button
              onClick={goToLevelSelection}
              className="h-14 text-lg orbitron uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/50"
              variant="default"
            >
              <Robot className="mr-2" size={24} />
              Vs. AI
            </Button>
            
            <Button
              onClick={() => {
                soundManager.playButtonClick();
                startGame('ai', selectedMap || 'open');
              }}
              className="h-12 text-base orbitron uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/50"
              variant="secondary"
            >
              Quick Match
            </Button>

            <Button
              onClick={goToOnlineMode}
              className="h-14 text-lg orbitron uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/50"
              variant="default"
            >
              <WifiHigh className="mr-2" size={24} />
              Online Multiplayer
            </Button>

            <Button
              onClick={goToMapSelection}
              className="h-14 text-lg orbitron uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/30"
              variant="outline"
            >
              <MapPin className="mr-2" size={24} />
              Map Selection
            </Button>

            <Button
              onClick={goToUnitSelection}
              className="h-14 text-lg orbitron uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/30"
              variant="outline"
            >
              <ListChecks className="mr-2" size={24} />
              Unit Selection
            </Button>

            <Button
              onClick={goToSettings}
              className="h-14 text-lg orbitron uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/30"
              variant="outline"
            >
              <GearSix className="mr-2" size={24} />
              Settings
            </Button>

            <Button
              onClick={goToStatistics}
              className="h-14 text-lg orbitron uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/30"
              variant="outline"
            >
              <ChartBar className="mr-2" size={24} />
              Statistics
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
                      onClick={() => {
                        soundManager.playButtonClick();
                        setPlayerColor(color.value);
                      }}
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
                      onClick={() => {
                        soundManager.playButtonClick();
                        setEnemyColor(color.value);
                      }}
                      className="w-12 h-12 rounded border-2 transition-all"
                      style={{
                        backgroundColor: color.value,
                        borderColor: enemyColor === color.value ? 'white' : 'transparent',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="sound-toggle" className="flex items-center gap-2">
                  {soundEnabled ? <SpeakerHigh size={20} /> : <SpeakerSlash size={20} />}
                  Sound Effects
                </Label>
                <Switch
                  id="sound-toggle"
                  checked={soundEnabled ?? true}
                  onCheckedChange={(checked) => {
                    setSoundEnabled(checked);
                    if (checked) {
                      soundManager.playButtonClick();
                    }
                  }}
                />
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sfx-volume">SFX Volume</Label>
                    <span className="text-sm text-muted-foreground">{Math.round((sfxVolume ?? 0.7) * 100)}%</span>
                  </div>
                  <Slider
                    id="sfx-volume"
                    value={[sfxVolume ?? 0.7]}
                    onValueChange={(values) => {
                      setSfxVolume(values[0]);
                    }}
                    min={0}
                    max={1}
                    step={0.01}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="music-volume">Music Volume</Label>
                    <span className="text-sm text-muted-foreground">{Math.round((musicVolume ?? 0.5) * 100)}%</span>
                  </div>
                  <Slider
                    id="music-volume"
                    value={[musicVolume ?? 0.5]}
                    onValueChange={(values) => {
                      setMusicVolume(values[0]);
                    }}
                    min={0}
                    max={1}
                    step={0.01}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="numeric-hp-toggle">Show Numeric HP</Label>
                <Switch
                  id="numeric-hp-toggle"
                  checked={showNumericHP ?? true}
                  onCheckedChange={(checked) => {
                    setShowNumericHP(checked);
                    soundManager.playButtonClick();
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="minimap-toggle">Show Minimap</Label>
                <Switch
                  id="minimap-toggle"
                  checked={showMinimap ?? true}
                  onCheckedChange={(checked) => {
                    setShowMinimap(checked);
                    soundManager.playButtonClick();
                  }}
                />
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
          unitSlots={unitSlots as Record<'left' | 'up' | 'down' | 'right', UnitType>}
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

      {gameState.mode === 'levelSelection' && (
        <LevelSelectionScreen
          onBack={backToMenu}
          onSelectLevel={handleLevelSelect}
          currentMap={selectedMap || 'open'}
        />
      )}

      {gameState.mode === 'onlineMode' && (
        <OnlineModeScreen
          onBack={backToMenu}
          onMatchmaking={goToMatchmaking}
          onCustomGame={goToMultiplayer}
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

      {gameState.mode === 'statistics' && (
        <StatisticsScreen
          statistics={playerStatistics || createEmptyStatistics()}
          onBack={backToMenu}
        />
      )}

      {gameState.mode === 'victory' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-500">
          <Card className="w-96 max-w-full animate-in zoom-in-95 slide-in-from-bottom-4 duration-700">
            <CardHeader>
              <CardTitle className="orbitron text-3xl text-center animate-in slide-in-from-top-2 duration-500 delay-300">
                {gameState.winner === -1 ? 'Draw!' : gameState.winner === 0 ? 'Victory!' : 'Defeat'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center animate-in fade-in slide-in-from-bottom-2 duration-500 delay-500">
                {gameState.winner === -1 
                  ? 'Time limit reached! Both players dealt equal damage.' 
                  : gameState.winner === 0 
                    ? gameState.elapsedTime >= (gameState.matchTimeLimit || 300) 
                      ? 'Time limit reached! Your base took less damage.'
                      : 'You destroyed the enemy base!' 
                    : gameState.elapsedTime >= (gameState.matchTimeLimit || 300)
                      ? 'Time limit reached! Your base took more damage.'
                      : 'Your base was destroyed.'}
              </p>
              <Button 
                onClick={() => returnToMenu(
                  true, 
                  gameState.winner === -1 ? 'draw' : gameState.winner === 0 ? 'victory' : 'defeat'
                )} 
                className="w-full orbitron animate-in fade-in slide-in-from-bottom-2 duration-500 delay-700" 
                variant="default"
              >
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
    projectiles: [],
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
      unitSlots: { left: 'marine', up: 'warrior', down: 'snaker', right: 'tank' },
      selectedMap: 'open',
      showNumericHP: true,
    },
    surrenderClicks: 0,
    lastSurrenderClickTime: 0,
    surrenderExpanded: false,
  };
}

function createCountdownState(mode: 'ai' | 'player', settings: GameState['settings'], canvas: HTMLCanvasElement): GameState {
  const arenaWidth = window.innerWidth / 20;
  const arenaHeight = window.innerHeight / 20;

  const selectedMapDef = getMapById(settings.selectedMap) || getMapById('open')!;
  const obstacles = selectedMapDef.obstacles;
  const basePositions = getValidBasePositions(arenaWidth, arenaHeight, obstacles, isPortraitOrientation());
  
  // Generate topography lines and starfield for this level
  const topographyLines = generateTopographyLines(canvas.width, canvas.height);
  const stars = generateStarfield(canvas.width, canvas.height);
  const nebulaClouds = generateNebulaClouds(canvas.width, canvas.height);

  return {
    mode: 'countdown',
    vsMode: mode,
    units: [],
    projectiles: [],
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
      { photons: 50, incomeRate: 1, color: settings.playerColor },
      { photons: 50, incomeRate: 1, color: settings.enemyColor },
    ],
    selectedUnits: new Set(),
    elapsedTime: 0,
    lastIncomeTime: 0,
    winner: null,
    settings,
    surrenderClicks: 0,
    lastSurrenderClickTime: 0,
    surrenderExpanded: false,
    countdownStartTime: Date.now(),
    matchStats: {
      startTime: Date.now(),
      unitsTrainedByPlayer: 0,
      unitsKilledByPlayer: 0,
      damageDealtByPlayer: 0,
      photonsSpentByPlayer: 0,
      damageToPlayerBase: 0,
      damageToEnemyBase: 0,
    },
    matchTimeLimit: 300,
    topographyLines,
    nebulaClouds,
    stars,
    isPortrait: isPortraitOrientation(),
  };
}

function createGameState(mode: 'ai' | 'player', settings: GameState['settings']): GameState {
  const arenaWidth = window.innerWidth / 20;
  const arenaHeight = window.innerHeight / 20;

  const selectedMapDef = getMapById(settings.selectedMap) || getMapById('open')!;
  const obstacles = selectedMapDef.obstacles;
  const basePositions = getValidBasePositions(arenaWidth, arenaHeight, obstacles, isPortraitOrientation());

  return {
    mode: 'game',
    vsMode: mode,
    units: [],
    projectiles: [],
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
      { photons: 50, incomeRate: 1, color: settings.playerColor },
      { photons: 50, incomeRate: 1, color: settings.enemyColor },
    ],
    selectedUnits: new Set(),
    elapsedTime: 0,
    lastIncomeTime: 0,
    winner: null,
    settings,
    surrenderClicks: 0,
    lastSurrenderClickTime: 0,
    surrenderExpanded: false,
    matchStartAnimation: {
      startTime: Date.now(),
      phase: 'bases-sliding',
    },
    isPortrait: isPortraitOrientation(),
  };
}

function createOnlineGameState(lobby: LobbyData, isHost: boolean): GameState {
  const arenaWidth = window.innerWidth / 20;
  const arenaHeight = window.innerHeight / 20;

  const selectedMapDef = getMapById(lobby.mapId) || getMapById('open')!;
  const obstacles = selectedMapDef.obstacles;
  const basePositions = getValidBasePositions(arenaWidth, arenaHeight, obstacles, isPortraitOrientation());

  return {
    mode: 'game',
    vsMode: 'online',
    units: [],
    projectiles: [],
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
      { photons: 50, incomeRate: 1, color: isHost ? lobby.hostColor : lobby.guestColor || COLORS.playerDefault },
      { photons: 50, incomeRate: 1, color: isHost ? lobby.guestColor || COLORS.enemyDefault : lobby.hostColor },
    ],
    selectedUnits: new Set(),
    elapsedTime: 0,
    lastIncomeTime: 0,
    winner: null,
    settings: {
      playerColor: isHost ? lobby.hostColor : lobby.guestColor || COLORS.playerDefault,
      enemyColor: isHost ? lobby.guestColor || COLORS.enemyDefault : lobby.hostColor,
      enabledUnits: new Set(lobby.enabledUnits as UnitType[]),
      unitSlots: { left: 'marine', up: 'warrior', down: 'snaker', right: 'tank' },
      selectedMap: lobby.mapId,
      showNumericHP: true,
    },
    surrenderClicks: 0,
    lastSurrenderClickTime: 0,
    surrenderExpanded: false,
    matchStartAnimation: {
      startTime: Date.now(),
      phase: 'bases-sliding',
    },
    isPortrait: isPortraitOrientation(),
  };
}

function createOnlineCountdownState(lobby: LobbyData, isHost: boolean, canvas: HTMLCanvasElement): GameState {
  const arenaWidth = window.innerWidth / 20;
  const arenaHeight = window.innerHeight / 20;

  const selectedMapDef = getMapById(lobby.mapId) || getMapById('open')!;
  const obstacles = selectedMapDef.obstacles;
  const basePositions = getValidBasePositions(arenaWidth, arenaHeight, obstacles, isPortraitOrientation());
  
  // Generate topography lines and starfield for this level
  const topographyLines = generateTopographyLines(canvas.width, canvas.height);
  const stars = generateStarfield(canvas.width, canvas.height);
  const nebulaClouds = generateNebulaClouds(canvas.width, canvas.height);

  return {
    mode: 'countdown',
    vsMode: 'online',
    units: [],
    projectiles: [],
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
      { photons: 50, incomeRate: 1, color: isHost ? lobby.hostColor : lobby.guestColor || COLORS.playerDefault },
      { photons: 50, incomeRate: 1, color: isHost ? lobby.guestColor || COLORS.enemyDefault : lobby.hostColor },
    ],
    selectedUnits: new Set(),
    elapsedTime: 0,
    lastIncomeTime: 0,
    winner: null,
    settings: {
      playerColor: isHost ? lobby.hostColor : lobby.guestColor || COLORS.playerDefault,
      enemyColor: isHost ? lobby.guestColor || COLORS.enemyDefault : lobby.hostColor,
      enabledUnits: new Set(lobby.enabledUnits as UnitType[]),
      unitSlots: { left: 'marine', up: 'warrior', down: 'snaker', right: 'tank' },
      selectedMap: lobby.mapId,
      showNumericHP: true,
    },
    surrenderClicks: 0,
    lastSurrenderClickTime: 0,
    surrenderExpanded: false,
    countdownStartTime: Date.now(),
    matchStats: {
      startTime: Date.now(),
      unitsTrainedByPlayer: 0,
      unitsKilledByPlayer: 0,
      damageDealtByPlayer: 0,
      photonsSpentByPlayer: 0,
      damageToPlayerBase: 0,
      damageToEnemyBase: 0,
    },
    matchTimeLimit: 300,
    topographyLines,
    nebulaClouds,
    stars,
    isPortrait: isPortraitOrientation(),
  };
}

export default App;
