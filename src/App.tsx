import { useEffect, useRef, useState, useCallback } from 'react';
import { useKV } from './hooks/useKV';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { GameState, COLORS, UnitType, BASE_SIZE_METERS, UNIT_DEFINITIONS, FactionType, FACTION_DEFINITIONS, BASE_TYPE_DEFINITIONS, BaseType, ARENA_WIDTH_METERS, ARENA_HEIGHT_METERS } from './lib/types';
import { generateId, generateTopographyLines, generateStarfield, generateNebulaClouds, shouldUsePortraitCoordinates, updateViewportScale, calculateDefaultRallyPoint, createMiningDepots } from './lib/gameUtils';
import { updateGame } from './lib/simulation';
import { updateAI } from './lib/ai';
import { renderGame } from './lib/renderer';
import { handleTouchStart, handleTouchMove, handleTouchEnd, handleMouseDown, handleMouseMove, handleMouseUp, getActiveSelectionRect } from './lib/input';
import { initializeCamera, updateCamera, zoomCamera, panCamera, resetCamera } from './lib/camera';
import { updateVisualEffects, createCelebrationParticles } from './lib/visualEffects';
import { FormationType, getFormationName } from './lib/formations';
import { initializeFloaters, updateFloaters } from './lib/floaters';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Label } from './components/ui/label';
import { Switch } from './components/ui/switch';
import { Slider } from './components/ui/slider';
import { GameController, Robot, ListChecks, GearSix, ArrowLeft, Flag, MapPin, WifiHigh, ChartBar, SpeakerHigh, SpeakerSlash, Info, Book } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { UnitSelectionScreen } from './components/UnitSelectionScreen';
import { MapSelectionScreen } from './components/MapSelectionScreen';
import { LevelSelectionScreen } from './components/LevelSelectionScreen';
import { OnlineModeScreen } from './components/OnlineModeScreen';
import { LANModeScreen } from './components/LANModeScreen';
import { MultiplayerLobbyScreen } from './components/MultiplayerLobbyScreen';
import { StatisticsScreen } from './components/StatisticsScreen';
import { ModifierHelpScreen } from './components/ModifierHelpScreen';
import { UnitInformationScreen } from './components/UnitInformationScreen';
import { VictoryScreen } from './components/VictoryScreen';
import { AnimatedBackground } from './components/AnimatedBackground';
import { getMapById, getValidBasePositions, createBoundaryObstacles } from './lib/maps';
import { MultiplayerManager, LobbyData } from './lib/multiplayer';
import { createRealtimeStore } from './lib/realtimeStore';
import { LANKVStore } from './lib/lanStore';
import { PlayerStatistics, MatchStats, createEmptyStatistics, updateStatistics, calculateMMRChange } from './lib/statistics';
import { soundManager } from './lib/sound';
import { MultiplayerSync, initializeMultiplayerSync, updateMultiplayerSync } from './lib/multiplayerGame';

// Matchmaking configuration
const MATCHMAKING_AUTO_START_DELAY_MS = 2000; // Delay before auto-starting matchmaking game
const LAN_CONNECTION_WAIT_MS = 1000; // Wait for LAN connection to establish

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState>(createInitialState());
  const [renderTrigger, setRenderTrigger] = useState(0);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number>(Date.now());
  const multiplayerManagerRef = useRef<MultiplayerManager | null>(null);
  const multiplayerSyncRef = useRef<MultiplayerSync | null>(null);
  const lanStoreRef = useRef<LANKVStore | null>(null);
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
  const [showPerformance, setShowPerformance] = useKV<boolean>('show-performance', false);
  const [enableCameraControls, setEnableCameraControls] = useKV<boolean>('enable-camera-controls', true);
  const [playerFaction, setPlayerFaction] = useKV<FactionType>('player-faction', 'radiant');
  const [enemyFaction, setEnemyFaction] = useKV<FactionType>('enemy-faction', 'radiant');
  const [playerBaseType, setPlayerBaseType] = useKV<import('./lib/types').BaseType>('player-base-type', 'standard');
  const [enemyBaseType, setEnemyBaseType] = useKV<import('./lib/types').BaseType>('enemy-base-type', 'standard');
  const [enableGlowEffects, setEnableGlowEffects] = useKV<boolean>('enable-glow-effects', true);
  const [enableParticleEffects, setEnableParticleEffects] = useKV<boolean>('enable-particle-effects', true);
  const [enableMotionBlur, setEnableMotionBlur] = useKV<boolean>('enable-motion-blur', true);
  const [mirrorAbilityCasting, setMirrorAbilityCasting] = useKV<boolean>('mirror-ability-casting', false);
  const [chessMode, setChessMode] = useKV<boolean>('chess-mode', false);

  const gameState = gameStateRef.current;
  const lastVictoryStateRef = useRef<boolean>(false);
  // Use Vite's base URL to build sprite paths that work in subdirectory deployments.
  const assetBaseUrl = import.meta.env.BASE_URL;

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
      // Initialize multiplayer with the best available realtime backend (Spark or Supabase).
      multiplayerManagerRef.current = new MultiplayerManager(uid, createRealtimeStore());
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
      playerFaction: playerFaction || 'radiant',
      enemyFaction: enemyFaction || 'radiant',
      playerBaseType: playerBaseType || 'standard',
      enemyBaseType: enemyBaseType || 'standard',
      enableGlowEffects: enableGlowEffects ?? true,
      enableParticleEffects: enableParticleEffects ?? true,
      enableMotionBlur: enableMotionBlur ?? true,
      mirrorAbilityCasting: mirrorAbilityCasting ?? false,
      chessMode: chessMode ?? false,
    };
    gameStateRef.current.showMinimap = showMinimap ?? true;
    gameStateRef.current.players = gameStateRef.current.players.map((p, i) => ({
      ...p,
      color: i === 0 ? (playerColor || COLORS.playerDefault) : (enemyColor || COLORS.enemyDefault),
    }));
  }, [playerColor, enemyColor, enabledUnits, unitSlots, selectedMap, showNumericHP, showMinimap, playerFaction, enemyFaction, enableGlowEffects, enableParticleEffects, enableMotionBlur, mirrorAbilityCasting, chessMode]);

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
      
      // Store device context for gameplay and rendering logic
      gameStateRef.current.isMobile = isMobile;
      // Keep gameplay coordinates portrait-based even when the desktop view rotates
      gameStateRef.current.isPortrait = shouldUsePortraitCoordinates();
    };

    const resizeCanvas = () => {
      detectOrientation();
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      // Update viewport scale for consistent arena size across devices
      updateViewportScale(canvas.width, canvas.height);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);

    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      // Performance profiling
      const updateStartTime = performance.now();

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

      // Update background battle when in menu mode
      if (gameStateRef.current.mode === 'menu') {
        // Initialize background battle if it doesn't exist
        if (!gameStateRef.current.backgroundBattle) {
          gameStateRef.current.backgroundBattle = createBackgroundBattle(canvas);
          initializeCamera(gameStateRef.current.backgroundBattle);
        }

        // Set volume to 20% for background sounds
        soundManager.setVolumeScale(0.2);

        // Update the background battle
        const bg = gameStateRef.current.backgroundBattle;
        updateGame(bg, deltaTime);
        updateFloaters(bg, deltaTime);
        updateAI(bg, deltaTime, true); // Both players are AI
        updateCamera(bg, deltaTime);
        updateVisualEffects(bg, deltaTime);

        // Restart battle if one side wins
        if (bg.winner !== null) {
          gameStateRef.current.backgroundBattle = createBackgroundBattle(canvas);
          initializeCamera(gameStateRef.current.backgroundBattle);
        }
      } else {
        // Reset volume scale to 100% when not in menu
        soundManager.setVolumeScale(1.0);
      }

      if (gameStateRef.current.mode === 'countdown') {
        const elapsed = now - (gameStateRef.current.countdownStartTime || now);
        // Track the countdown seconds in game state so the UI re-renders reliably.
        const secondsRemaining = Math.max(0, Math.ceil(3 - elapsed / 1000));
        const previousSeconds = gameStateRef.current.countdownSeconds ?? secondsRemaining;
        
        if (secondsRemaining !== previousSeconds) {
          gameStateRef.current.countdownSeconds = secondsRemaining;
          setRenderTrigger(prev => prev + 1);
        }

        if (secondsRemaining !== previousSeconds && secondsRemaining > 0) {
          soundManager.playCountdown();
        }
        
        // Update floaters during countdown
        updateFloaters(gameStateRef.current, deltaTime);
        updateVisualEffects(gameStateRef.current, deltaTime);
        
        if (elapsed >= 3000) {
          gameStateRef.current.mode = 'game';
          gameStateRef.current.matchStartAnimation = {
            startTime: now,
            phase: 'bases-sliding',
          };
          soundManager.playMatchStart();
          
          // Initialize camera for game
          initializeCamera(gameStateRef.current);
          
          delete gameStateRef.current.countdownStartTime;
          delete gameStateRef.current.countdownSeconds;
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
          
          // Update floaters physics
          updateFloaters(gameStateRef.current, deltaTime);
          
          // Update multiplayer synchronization for online games
          if (gameStateRef.current.vsMode === 'online' && multiplayerManagerRef.current && multiplayerSyncRef.current) {
            const localPlayerIndex = multiplayerManagerRef.current.getIsHost() ? 0 : 1;
            updateMultiplayerSync(
              gameStateRef.current,
              multiplayerManagerRef.current,
              multiplayerSyncRef.current,
              localPlayerIndex
            ).catch(err => console.warn('Multiplayer sync error:', err));
          }
          
          updateAI(gameStateRef.current, deltaTime);
          
          // Update camera and visual effects
          if (enableCameraControls) {
            updateCamera(gameStateRef.current, deltaTime);
          }
          updateVisualEffects(gameStateRef.current, deltaTime);
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
      
      // Update visual effects even in victory mode
      if (gameStateRef.current.mode === 'victory') {
        // Trigger celebration particles on first victory frame
        if (!lastVictoryStateRef.current && canvas) {
          createCelebrationParticles(gameStateRef.current, canvas.width, canvas.height);
          lastVictoryStateRef.current = true;
        }
        updateVisualEffects(gameStateRef.current, deltaTime);
      } else {
        lastVictoryStateRef.current = false;
      }

      const updateEndTime = performance.now();
      const renderStartTime = performance.now();

      // Render background battle if in menu or related mode
      if (gameStateRef.current.mode === 'menu' && gameStateRef.current.backgroundBattle) {
        renderGame(ctx, gameStateRef.current.backgroundBattle, canvas, null);
      } else {
        const selectionRect = getActiveSelectionRect();
        renderGame(ctx, gameStateRef.current, canvas, selectionRect);
      }

      const renderEndTime = performance.now();

      // Update performance profiling
      if (showPerformance) {
        if (!gameStateRef.current.performanceProfiling) {
          gameStateRef.current.performanceProfiling = {
            enabled: true,
            frameTimings: [],
            updateTime: 0,
            renderTime: 0,
            avgFrameTime: 0,
          };
        }
        
        gameStateRef.current.performanceProfiling.updateTime = updateEndTime - updateStartTime;
        gameStateRef.current.performanceProfiling.renderTime = renderEndTime - renderStartTime;
        
        const frameTime = renderEndTime - updateStartTime;
        gameStateRef.current.performanceProfiling.frameTimings.push(frameTime);
        if (gameStateRef.current.performanceProfiling.frameTimings.length > 60) {
          gameStateRef.current.performanceProfiling.frameTimings.shift();
        }
        
        const sum = gameStateRef.current.performanceProfiling.frameTimings.reduce((a, b) => a + b, 0);
        gameStateRef.current.performanceProfiling.avgFrameTime = sum / gameStateRef.current.performanceProfiling.frameTimings.length;
      }

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoop();
    
    // Add mouse wheel zoom handler
    const handleWheel = (e: WheelEvent) => {
      if (gameStateRef.current.mode === 'game' && enableCameraControls) {
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? -1 : 1;
        zoomCamera(gameStateRef.current, zoomDelta);
      }
    };
    
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('orientationchange', resizeCanvas);
      canvas.removeEventListener('wheel', handleWheel);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [enableCameraControls]);

  // Camera pan controls with WASD and Arrow keys
  useEffect(() => {
    if (!enableCameraControls || gameState.mode !== 'game') return;

    const pressedKeys = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.key)) {
        pressedKeys.add(e.key.toLowerCase());
        e.preventDefault();
      }
      
      // P key to enable patrol mode
      if (e.key === 'p' || e.key === 'P') {
        gameStateRef.current.patrolMode = true;
        e.preventDefault();
      }
      
      // R key to reset camera
      if (e.key === 'r' || e.key === 'R') {
        resetCamera(gameStateRef.current);
        e.preventDefault();
      }
      
      // F key to cycle formations
      if (e.key === 'f' || e.key === 'F') {
        const formations: FormationType[] = ['none', 'line', 'spread', 'cluster', 'wedge', 'circle'];
        const currentIndex = formations.indexOf(gameStateRef.current.currentFormation);
        const nextIndex = (currentIndex + 1) % formations.length;
        gameStateRef.current.currentFormation = formations[nextIndex];
        toast.info(`Formation: ${getFormationName(gameStateRef.current.currentFormation)}`, {
          duration: 2000,
        });
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      pressedKeys.delete(e.key.toLowerCase());
      
      // P key released - disable patrol mode
      if (e.key === 'p' || e.key === 'P') {
        gameStateRef.current.patrolMode = false;
      }
    };

    // Update camera position based on pressed keys
    const updateCameraPan = () => {
      if (pressedKeys.size === 0 || !enableCameraControls) return;

      const direction = { x: 0, y: 0 };
      
      if (pressedKeys.has('w') || pressedKeys.has('arrowup')) direction.y -= 1;
      if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) direction.y += 1;
      if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) direction.x -= 1;
      if (pressedKeys.has('d') || pressedKeys.has('arrowright')) direction.x += 1;

      // Normalize diagonal movement
      const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
      if (length > 0) {
        direction.x /= length;
        direction.y /= length;
        panCamera(gameStateRef.current, direction, 1/60);
      }
    };

    const intervalId = setInterval(updateCameraPan, 16); // ~60fps

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enableCameraControls, gameState.mode]);

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
    
    // Set multiplayer manager in game state for input handlers to use
    gameStateRef.current.multiplayerManager = multiplayerManagerRef.current;
    
    // Initialize network status
    gameStateRef.current.networkStatus = {
      connected: true,
      lastSync: Date.now(),
    };
    
    // Initialize multiplayer synchronization
    multiplayerSyncRef.current = initializeMultiplayerSync();
    
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

  const goToMatchmaking = async () => {
    soundManager.playButtonClick();
    
    if (!multiplayerManagerRef.current) {
      toast.error('Multiplayer not available');
      return;
    }
    
    toast.info('Searching for opponent...');
    
    try {
      // Get available lobbies
      const lobbies = await multiplayerManagerRef.current.getAvailableLobbies();
      
      if (lobbies.length > 0) {
        // Join the first available lobby
        const lobby = lobbies[0];
        const playerName = `Player_${userId.slice(-4)}`;
        
        const success = await multiplayerManagerRef.current.joinGame(
          lobby.gameId,
          playerName,
          enemyColor || COLORS.enemyDefault
        );
        
        if (success) {
          const updatedLobby = await multiplayerManagerRef.current.getLobby(lobby.gameId);
          setCurrentLobby(updatedLobby);
          gameStateRef.current.mode = 'multiplayerLobby';
          toast.success('Opponent found! Waiting for host to start...');
          
          // Start checking for game start
          lobbyCheckIntervalRef.current = setInterval(async () => {
            const updatedLobby = await multiplayerManagerRef.current?.getLobby(lobby.gameId);
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
          toast.error('Failed to join game. Trying again...');
          // Try creating a new game instead
          await createMatchmakingLobby();
        }
      } else {
        // No lobbies available, create a new one
        await createMatchmakingLobby();
      }
      
      setRenderTrigger(prev => prev + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Matchmaking failed';
      toast.error(message);
    }
  };
  
  const createMatchmakingLobby = async () => {
    if (!multiplayerManagerRef.current) return;
    
    const playerName = `Player_${userId.slice(-4)}`;
    
    try {
      const gameId = await multiplayerManagerRef.current.createGame(
        playerName,
        playerColor || COLORS.playerDefault,
        selectedMap || 'open',
        enabledUnits || ['marine', 'warrior', 'snaker']
      );
      
      const lobby = await multiplayerManagerRef.current.getLobby(gameId);
      setCurrentLobby(lobby);
      gameStateRef.current.mode = 'multiplayerLobby';
      toast.success('Waiting for opponent...');
      
      // Start checking for opponent joining
      lobbyCheckIntervalRef.current = setInterval(async () => {
        const updatedLobby = await multiplayerManagerRef.current?.getLobby(gameId);
        if (updatedLobby) {
          setCurrentLobby(updatedLobby);
          if (updatedLobby.guestId) {
            toast.success('Opponent found! Starting game...');
            // Auto-start the game after a configured delay
            setTimeout(async () => {
              await multiplayerManagerRef.current?.startGame();
            }, MATCHMAKING_AUTO_START_DELAY_MS);
          }
          if (updatedLobby.status === 'playing') {
            if (lobbyCheckIntervalRef.current) {
              clearInterval(lobbyCheckIntervalRef.current);
              lobbyCheckIntervalRef.current = null;
            }
          }
        }
      }, 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create matchmaking lobby';
      toast.error(message);
    }
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

  const goToModifierHelp = () => {
    soundManager.playButtonClick();
    gameStateRef.current.mode = 'modifierHelp';
    setRenderTrigger(prev => prev + 1);
  };

  const goToUnitInformation = () => {
    soundManager.playButtonClick();
    gameStateRef.current.mode = 'unitInformation';
    setRenderTrigger(prev => prev + 1);
  };

  const goToLANMode = () => {
    soundManager.playButtonClick();
    // Disconnect any existing LAN store
    if (lanStoreRef.current) {
      lanStoreRef.current.disconnect();
      lanStoreRef.current = null;
    }
    gameStateRef.current.mode = 'lanMode';
    setRenderTrigger(prev => prev + 1);
  };

  const handleLANHost = async (): Promise<string> => {
    // Disconnect any existing LAN store
    if (lanStoreRef.current) {
      lanStoreRef.current.disconnect();
    }
    
    // Create new LAN store instance
    const lanStore = new LANKVStore();
    lanStoreRef.current = lanStore;
    
    // Create a lobby first to get player name and map
    const playerName = `Host_${userId.slice(-4)}`;
    const mapId = selectedMap || 'open';
    
    // Initialize as host with game info
    const peerId = await lanStore.initAsHost(playerName, mapId);
    
    // Create multiplayer manager with LAN store
    multiplayerManagerRef.current = new MultiplayerManager(userId, lanStore);
    
    // Create a lobby
    const gameId = await multiplayerManagerRef.current.createGame(
      playerName,
      playerColor || COLORS.playerDefault,
      mapId,
      enabledUnits || []
    );
    
    const lobby = await multiplayerManagerRef.current.getLobby(gameId);
    setCurrentLobby(lobby);
    
    // Navigate to lobby
    gameStateRef.current.mode = 'multiplayerLobby';
    setRenderTrigger(prev => prev + 1);
    
    // Start checking for guest joining
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
    
    return peerId;
  };

  const handleLANJoin = async (hostPeerId: string): Promise<boolean> => {
    try {
      // Disconnect any existing LAN store
      if (lanStoreRef.current) {
        lanStoreRef.current.disconnect();
      }
      
      // Create new LAN store instance
      const lanStore = new LANKVStore();
      lanStoreRef.current = lanStore;
      
      // Initialize as guest
      await lanStore.initAsGuest(hostPeerId);
      
      // Create multiplayer manager with LAN store
      multiplayerManagerRef.current = new MultiplayerManager(userId, lanStore);
      
      // Wait for connection to establish
      await new Promise(resolve => setTimeout(resolve, LAN_CONNECTION_WAIT_MS));
      
      // Get available lobbies (should be the host's lobby)
      const lobbies = await multiplayerManagerRef.current.getAvailableLobbies();
      
      if (lobbies.length > 0) {
        const lobby = lobbies[0];
        const playerName = `Guest_${userId.slice(-4)}`;
        
        const success = await multiplayerManagerRef.current.joinGame(
          lobby.gameId,
          playerName,
          enemyColor || COLORS.enemyDefault
        );
        
        if (success) {
          const updatedLobby = await multiplayerManagerRef.current.getLobby(lobby.gameId);
          setCurrentLobby(updatedLobby);
          gameStateRef.current.mode = 'multiplayerLobby';
          setRenderTrigger(prev => prev + 1);
          
          // Start checking for game start
          lobbyCheckIntervalRef.current = setInterval(async () => {
            const updatedLobby = await multiplayerManagerRef.current?.getLobby(lobby.gameId);
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
          
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Failed to join LAN game:', error);
      return false;
    }
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
      const message = error instanceof Error ? error.message : 'Failed to create game';
      toast.error(message);
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
      const message = error instanceof Error ? error.message : 'Failed to join game';
      toast.error(message);
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
    onNumberKey: (num: number) => {
      if (gameState.mode === 'game') {
        // Ctrl/Cmd + number = assign selected units to control group
        // Just number = select control group
        const isAssigning = window.event && (
          (window.event as KeyboardEvent).ctrlKey || 
          (window.event as KeyboardEvent).metaKey
        );
        
        if (isAssigning) {
          // Assign current selection to control group
          gameStateRef.current.controlGroups[num] = new Set(gameStateRef.current.selectedUnits);
          toast.success(`Control group ${num} assigned (${gameStateRef.current.selectedUnits.size} units)`);
          soundManager.playButtonClick();
        } else {
          // Select control group
          const group = gameStateRef.current.controlGroups[num];
          if (group && group.size > 0) {
            // Filter out dead units
            const livingUnits = Array.from(group).filter(id => 
              gameStateRef.current.units.some(u => u.id === id && u.hp > 0)
            );
            
            if (livingUnits.length > 0) {
              gameStateRef.current.selectedUnits = new Set(livingUnits);
              gameStateRef.current.bases.forEach(b => b.isSelected = false);
              soundManager.playUnitSelect();
              setRenderTrigger(prev => prev + 1);
            } else {
              toast.info(`Control group ${num} is empty`);
            }
          }
        }
      }
    },
  }, gameState.mode === 'game' || gameState.mode !== 'menu');

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background" onClick={handleCanvasSurrenderReset}>
      {/* Animated background for menu screens */}
      {gameState.mode !== 'game' && gameState.mode !== 'countdown' && (
        <AnimatedBackground 
          particleCount={60} 
          color={playerColor || COLORS.playerDefault}
          galaxyCount={3}
        />
      )}
      
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
              {gameState.countdownSeconds ?? 3}
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
        <>
          {/* 50% transparent black overlay */}
          <div className="absolute inset-0 bg-black opacity-50 pointer-events-none" />
          
          <div className="absolute inset-0 flex items-center justify-center animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 w-80 max-w-[90vw]">
              <div className="flex justify-center mb-4 animate-in fade-in zoom-in-95 duration-700">
                <img 
                  src={`${assetBaseUrl}ASSETS/sprites/menus/mainMenuTitle.png`} 
                  alt="Speed of Light RTS"
                  className="w-full max-w-md neon-glow"
                  style={{
                  filter: 'drop-shadow(0 0 20px currentColor)'
                }}
              />
            </div>

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

            <Button
              onClick={goToModifierHelp}
              className="h-14 text-lg orbitron uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/30"
              variant="outline"
            >
              <Info className="mr-2" size={24} />
              Unit Guide
            </Button>

            <Button
              onClick={goToUnitInformation}
              className="h-14 text-lg orbitron uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/30"
              variant="outline"
            >
              <Book className="mr-2" size={24} />
              Unit Information
            </Button>
          </div>
        </div>
        </>
      )}

      {gameState.mode === 'settings' && (
        <div className="absolute inset-0 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4 py-8">
          <Card className="w-96 max-w-full my-auto">
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

              <div className="flex items-center justify-between">
                <Label htmlFor="camera-toggle">Camera Controls (Zoom/Pan)</Label>
                <Switch
                  id="camera-toggle"
                  checked={enableCameraControls ?? true}
                  onCheckedChange={(checked) => {
                    setEnableCameraControls(checked);
                    soundManager.playButtonClick();
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="performance-toggle">Show Performance Stats</Label>
                <Switch
                  id="performance-toggle"
                  checked={showPerformance ?? false}
                  onCheckedChange={(checked) => {
                    setShowPerformance(checked);
                    soundManager.playButtonClick();
                  }}
                />
              </div>

              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                <p><strong>Visual Effects (Shaders):</strong></p>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="glow-toggle">Glow & Shadow Effects</Label>
                <Switch
                  id="glow-toggle"
                  checked={enableGlowEffects ?? true}
                  onCheckedChange={(checked) => {
                    setEnableGlowEffects(checked);
                    soundManager.playButtonClick();
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="particle-toggle">Particle Effects</Label>
                <Switch
                  id="particle-toggle"
                  checked={enableParticleEffects ?? true}
                  onCheckedChange={(checked) => {
                    setEnableParticleEffects(checked);
                    soundManager.playButtonClick();
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="motionblur-toggle">Motion Blur Trails</Label>
                <Switch
                  id="motionblur-toggle"
                  checked={enableMotionBlur ?? true}
                  onCheckedChange={(checked) => {
                    setEnableMotionBlur(checked);
                    soundManager.playButtonClick();
                  }}
                />
              </div>

              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                <p><strong>Controls:</strong></p>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="mirror-ability-toggle">Mirror Ability Casting</Label>
                <Switch
                  id="mirror-ability-toggle"
                  checked={mirrorAbilityCasting ?? false}
                  onCheckedChange={(checked) => {
                    setMirrorAbilityCasting(checked);
                    soundManager.playButtonClick();
                  }}
                />
              </div>

              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                <p><strong>Game Mode:</strong></p>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="chess-mode-toggle" className="flex flex-col gap-1">
                  <span>Chess Mode</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Queue 1 move per unit every 10s
                  </span>
                </Label>
                <Switch
                  id="chess-mode-toggle"
                  checked={chessMode ?? false}
                  onCheckedChange={(checked) => {
                    setChessMode(checked);
                    soundManager.playButtonClick();
                  }}
                />
              </div>

              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                <p><strong>Camera Controls:</strong></p>
                <p>• Mouse Wheel: Zoom in/out</p>
                <p>• WASD or Arrow Keys: Pan camera</p>
                <p>• R Key: Reset camera</p>
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
        </div>
      )}

      {gameState.mode === 'unitSelection' && (
        <UnitSelectionScreen
          unitSlots={unitSlots as Record<'left' | 'up' | 'down' | 'right', UnitType>}
          onSlotChange={handleSlotChange}
          onBack={backToMenu}
          playerColor={playerColor || COLORS.playerDefault}
          playerFaction={playerFaction || 'radiant'}
          onFactionChange={setPlayerFaction}
          playerBaseType={playerBaseType || 'standard'}
          onBaseTypeChange={setPlayerBaseType}
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
          onLAN={goToLANMode}
        />
      )}

      {gameState.mode === 'lanMode' && (
        <LANModeScreen
          onBack={backToMenu}
          onHost={handleLANHost}
          onJoin={handleLANJoin}
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

      {gameState.mode === 'modifierHelp' && (
        <ModifierHelpScreen
          onBack={backToMenu}
        />
      )}

      {gameState.mode === 'unitInformation' && (
        <UnitInformationScreen
          onBack={backToMenu}
        />
      )}

      {gameState.mode === 'victory' && (
        <VictoryScreen
          gameState={gameState}
          onContinue={() => returnToMenu(
            true, 
            gameState.winner === -1 ? 'draw' : gameState.winner === 0 ? 'victory' : 'defeat'
          )}
          onRematch={gameState.vsMode === 'ai' ? () => {
            returnToMenu(true, gameState.winner === -1 ? 'draw' : gameState.winner === 0 ? 'victory' : 'defeat');
            setTimeout(() => startGame('ai', gameState.settings.selectedMap), 100);
          } : undefined}
        />
      )}
    </div>
  );
}

function createBackgroundBattle(canvas: HTMLCanvasElement): GameState {
  const arenaWidth = ARENA_WIDTH_METERS;
  const arenaHeight = ARENA_HEIGHT_METERS;

  // Randomly select factions for both players
  const factions: FactionType[] = ['radiant', 'solari', 'aurum'];
  const player1Faction = factions[Math.floor(Math.random() * factions.length)];
  const player2Faction = factions[Math.floor(Math.random() * factions.length)];

  // Randomly select some units for both sides using Fisher-Yates shuffle
  const allUnits: UnitType[] = ['marine', 'warrior', 'snaker', 'tank', 'scout', 'artillery', 'medic', 'interceptor'];
  const shuffled = [...allUnits];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const enabledUnits = new Set(shuffled.slice(0, Math.floor(Math.random() * 3) + 4)); // 4-6 random units

  const selectedMapDef = getMapById('open');
  if (!selectedMapDef) {
    throw new Error('Default map "open" not found');
  }
  const mapObstacles = selectedMapDef.obstacles;
  const boundaryObstacles = createBoundaryObstacles(arenaWidth, arenaHeight);
  const obstacles = [...mapObstacles, ...boundaryObstacles];
  
  // Keep base placement aligned to the shared portrait coordinate system
  const basePositions = getValidBasePositions(arenaWidth, arenaHeight, obstacles, shouldUsePortraitCoordinates());
  
  const topographyLines = generateTopographyLines(canvas.width, canvas.height);
  const stars = generateStarfield(canvas.width, canvas.height);
  const nebulaClouds = generateNebulaClouds(canvas.width, canvas.height);
  
  // Create mining depots in corners
  const miningDepots = createMiningDepots(arenaWidth, arenaHeight);

  const playerBaseTypeDef = BASE_TYPE_DEFINITIONS['standard'];

  return {
    mode: 'game',
    vsMode: 'ai',
    units: [],
    projectiles: [],
    obstacles: obstacles,
    miningDepots: miningDepots,
    bases: [
      {
        id: generateId(),
        owner: 0,
        position: basePositions.player,
        hp: playerBaseTypeDef.hp,
        maxHp: playerBaseTypeDef.hp,
        armor: playerBaseTypeDef.armor,
        movementTarget: null,
        rallyPoint: calculateDefaultRallyPoint(basePositions.player, basePositions.enemy),
        isSelected: false,
        laserCooldown: 0,
        faction: player1Faction,
        baseType: 'standard',
        autoAttackCooldown: 0,
      },
      {
        id: generateId(),
        owner: 1,
        position: basePositions.enemy,
        hp: playerBaseTypeDef.hp,
        maxHp: playerBaseTypeDef.hp,
        armor: playerBaseTypeDef.armor,
        movementTarget: null,
        rallyPoint: calculateDefaultRallyPoint(basePositions.enemy, basePositions.player),
        isSelected: false,
        laserCooldown: 0,
        faction: player2Faction,
        baseType: 'standard',
        autoAttackCooldown: 0,
      },
    ],
    players: [
      { photons: 200, incomeRate: 1, color: COLORS.playerDefault },
      { photons: 200, incomeRate: 1, color: COLORS.enemyDefault },
    ],
    selectedUnits: new Set(),
    controlGroups: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set(), 8: new Set() },
    currentFormation: 'none',
    patrolMode: false,
    elapsedTime: 0,
    lastIncomeTime: 0,
    winner: null,
    settings: {
      playerColor: COLORS.playerDefault,
      enemyColor: COLORS.enemyDefault,
      enabledUnits: enabledUnits,
      unitSlots: { left: 'marine', up: 'warrior', down: 'snaker', right: 'tank' },
      selectedMap: 'open',
      showNumericHP: false,
      playerFaction: player1Faction,
      enemyFaction: player2Faction,
      playerBaseType: 'standard',
      enemyBaseType: 'standard',
    },
    surrenderClicks: 0,
    lastSurrenderClickTime: 0,
    surrenderExpanded: false,
    topographyLines,
    nebulaClouds,
    stars,
    floaters: initializeFloaters(),
    // Keep gameplay coordinates consistent across devices
    isPortrait: shouldUsePortraitCoordinates(),
  };
}

function createInitialState(): GameState {
  return {
    mode: 'menu',
    vsMode: null,
    units: [],
    projectiles: [],
    bases: [],
    miningDepots: [],
    obstacles: [],
    players: [
      { photons: 0, incomeRate: 1, color: COLORS.playerDefault },
      { photons: 0, incomeRate: 1, color: COLORS.enemyDefault },
    ],
    selectedUnits: new Set(),
    controlGroups: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set(), 8: new Set() },
    currentFormation: 'none',
    patrolMode: false,
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
      playerFaction: 'radiant',
      enemyFaction: 'radiant',
      playerBaseType: 'standard',
      enemyBaseType: 'standard',
    },
    surrenderClicks: 0,
    lastSurrenderClickTime: 0,
    surrenderExpanded: false,
  };
}

function createCountdownState(mode: 'ai' | 'player', settings: GameState['settings'], canvas: HTMLCanvasElement): GameState {
  const arenaWidth = ARENA_WIDTH_METERS;
  const arenaHeight = ARENA_HEIGHT_METERS;

  const selectedMapDef = getMapById(settings.selectedMap) || getMapById('open')!;
  const mapObstacles = selectedMapDef.obstacles;
  
  // Add boundary obstacles to prevent units from getting stuck at screen edges
  const boundaryObstacles = createBoundaryObstacles(arenaWidth, arenaHeight);
  const obstacles = [...mapObstacles, ...boundaryObstacles];
  
  // Keep base placement aligned to the shared portrait coordinate system
  const basePositions = getValidBasePositions(arenaWidth, arenaHeight, obstacles, shouldUsePortraitCoordinates());
  
  // Generate topography lines and starfield for this level
  const topographyLines = generateTopographyLines(canvas.width, canvas.height);
  const stars = generateStarfield(canvas.width, canvas.height);
  const nebulaClouds = generateNebulaClouds(canvas.width, canvas.height);
  
  // Create mining depots in corners
  const miningDepots = createMiningDepots(arenaWidth, arenaHeight);

  const playerBaseTypeDef = BASE_TYPE_DEFINITIONS[settings.playerBaseType || 'standard'];
  const enemyBaseTypeDef = BASE_TYPE_DEFINITIONS[settings.enemyBaseType || 'standard'];

  return {
    mode: 'countdown',
    vsMode: mode,
    units: [],
    projectiles: [],
    obstacles: obstacles,
    miningDepots: miningDepots,
    bases: [
      {
        id: generateId(),
        owner: 0,
        position: basePositions.player,
        hp: playerBaseTypeDef.hp,
        maxHp: playerBaseTypeDef.hp,
        armor: playerBaseTypeDef.armor,
        movementTarget: null,
        rallyPoint: calculateDefaultRallyPoint(basePositions.player, basePositions.enemy),
        isSelected: false,
        laserCooldown: 0,
        faction: settings.playerFaction || 'radiant',
        baseType: settings.playerBaseType || 'standard',
        autoAttackCooldown: 0,
      },
      {
        id: generateId(),
        owner: 1,
        position: basePositions.enemy,
        hp: enemyBaseTypeDef.hp,
        maxHp: enemyBaseTypeDef.hp,
        armor: enemyBaseTypeDef.armor,
        movementTarget: null,
        rallyPoint: calculateDefaultRallyPoint(basePositions.enemy, basePositions.player),
        isSelected: false,
        laserCooldown: 0,
        faction: settings.enemyFaction || 'radiant',
        baseType: settings.enemyBaseType || 'standard',
        autoAttackCooldown: 0,
      },
    ],
    players: [
      { photons: 50, incomeRate: 1, color: settings.playerColor },
      { photons: 50, incomeRate: 1, color: settings.enemyColor },
    ],
    selectedUnits: new Set(),
    controlGroups: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set(), 8: new Set() },
    currentFormation: 'none',
    patrolMode: false,
    elapsedTime: 0,
    lastIncomeTime: 0,
    winner: null,
    settings,
    surrenderClicks: 0,
    lastSurrenderClickTime: 0,
    surrenderExpanded: false,
    // Seed the countdown clock so the overlay starts at 3 and ticks down.
    countdownStartTime: Date.now(),
    countdownSeconds: 3,
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
    floaters: initializeFloaters(),
    // Keep gameplay coordinates consistent across devices
    isPortrait: shouldUsePortraitCoordinates(),
  };
}

function createGameState(mode: 'ai' | 'player', settings: GameState['settings']): GameState {
  const arenaWidth = ARENA_WIDTH_METERS;
  const arenaHeight = ARENA_HEIGHT_METERS;

  const selectedMapDef = getMapById(settings.selectedMap) || getMapById('open')!;
  const mapObstacles = selectedMapDef.obstacles;
  
  // Add boundary obstacles to prevent units from getting stuck at screen edges
  const boundaryObstacles = createBoundaryObstacles(arenaWidth, arenaHeight);
  const obstacles = [...mapObstacles, ...boundaryObstacles];
  
  // Keep base placement aligned to the shared portrait coordinate system
  const basePositions = getValidBasePositions(arenaWidth, arenaHeight, obstacles, shouldUsePortraitCoordinates());
  
  // Create mining depots in corners
  const miningDepots = createMiningDepots(arenaWidth, arenaHeight);

  const playerBaseTypeDef = BASE_TYPE_DEFINITIONS[settings.playerBaseType || 'standard'];
  const enemyBaseTypeDef = BASE_TYPE_DEFINITIONS[settings.enemyBaseType || 'standard'];

  return {
    mode: 'game',
    vsMode: mode,
    units: [],
    projectiles: [],
    obstacles: obstacles,
    miningDepots: miningDepots,
    bases: [
      {
        id: generateId(),
        owner: 0,
        position: basePositions.player,
        hp: playerBaseTypeDef.hp,
        maxHp: playerBaseTypeDef.hp,
        armor: playerBaseTypeDef.armor,
        movementTarget: null,
        rallyPoint: calculateDefaultRallyPoint(basePositions.player, basePositions.enemy),
        isSelected: false,
        laserCooldown: 0,
        faction: settings.playerFaction || 'radiant',
        baseType: settings.playerBaseType || 'standard',
        autoAttackCooldown: 0,
      },
      {
        id: generateId(),
        owner: 1,
        position: basePositions.enemy,
        hp: enemyBaseTypeDef.hp,
        maxHp: enemyBaseTypeDef.hp,
        armor: enemyBaseTypeDef.armor,
        movementTarget: null,
        rallyPoint: calculateDefaultRallyPoint(basePositions.enemy, basePositions.player),
        isSelected: false,
        laserCooldown: 0,
        faction: settings.enemyFaction || 'radiant',
        baseType: settings.enemyBaseType || 'standard',
        autoAttackCooldown: 0,
      },
    ],
    players: [
      { photons: 50, incomeRate: 1, color: settings.playerColor },
      { photons: 50, incomeRate: 1, color: settings.enemyColor },
    ],
    selectedUnits: new Set(),
    controlGroups: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set(), 8: new Set() },
    currentFormation: 'none',
    patrolMode: false,
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
    // Keep gameplay coordinates consistent across devices
    isPortrait: shouldUsePortraitCoordinates(),
    floaters: initializeFloaters(),
  };
}

function createOnlineGameState(lobby: LobbyData, isHost: boolean): GameState {
  const arenaWidth = ARENA_WIDTH_METERS;
  const arenaHeight = ARENA_HEIGHT_METERS;

  const selectedMapDef = getMapById(lobby.mapId) || getMapById('open')!;
  const mapObstacles = selectedMapDef.obstacles;
  
  // Add boundary obstacles to prevent units from getting stuck at screen edges
  const boundaryObstacles = createBoundaryObstacles(arenaWidth, arenaHeight);
  const obstacles = [...mapObstacles, ...boundaryObstacles];
  
  // Keep base placement aligned to the shared portrait coordinate system
  const basePositions = getValidBasePositions(arenaWidth, arenaHeight, obstacles, shouldUsePortraitCoordinates());
  
  // Create mining depots in corners
  const miningDepots = createMiningDepots(arenaWidth, arenaHeight);

  // For online games, use standard base type for now
  const playerBaseTypeDef = BASE_TYPE_DEFINITIONS['standard'];
  const enemyBaseTypeDef = BASE_TYPE_DEFINITIONS['standard'];

  return {
    mode: 'game',
    vsMode: 'online',
    units: [],
    projectiles: [],
    obstacles: obstacles,
    miningDepots: miningDepots,
    bases: [
      {
        id: generateId(),
        owner: 0,
        position: basePositions.player,
        hp: playerBaseTypeDef.hp,
        maxHp: playerBaseTypeDef.hp,
        armor: playerBaseTypeDef.armor,
        movementTarget: null,
        rallyPoint: calculateDefaultRallyPoint(basePositions.player, basePositions.enemy),
        isSelected: false,
        laserCooldown: 0,
        faction: 'radiant',
        baseType: 'standard',
        autoAttackCooldown: 0,
      },
      {
        id: generateId(),
        owner: 1,
        position: basePositions.enemy,
        hp: enemyBaseTypeDef.hp,
        maxHp: enemyBaseTypeDef.hp,
        armor: enemyBaseTypeDef.armor,
        movementTarget: null,
        rallyPoint: calculateDefaultRallyPoint(basePositions.enemy, basePositions.player),
        isSelected: false,
        laserCooldown: 0,
        faction: 'radiant',
        baseType: 'standard',
        autoAttackCooldown: 0,
      },
    ],
    players: [
      { photons: 50, incomeRate: 1, color: isHost ? lobby.hostColor : lobby.guestColor || COLORS.playerDefault },
      { photons: 50, incomeRate: 1, color: isHost ? lobby.guestColor || COLORS.enemyDefault : lobby.hostColor },
    ],
    selectedUnits: new Set(),
    controlGroups: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set(), 8: new Set() },
    currentFormation: 'none',
    patrolMode: false,
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
      playerFaction: 'radiant',
      enemyFaction: 'radiant',
      playerBaseType: 'standard',
      enemyBaseType: 'standard',
    },
    surrenderClicks: 0,
    lastSurrenderClickTime: 0,
    surrenderExpanded: false,
    matchStartAnimation: {
      startTime: Date.now(),
      phase: 'bases-sliding',
    },
    // Keep gameplay coordinates consistent across devices
    isPortrait: shouldUsePortraitCoordinates(),
    floaters: initializeFloaters(),
  };
}

function createOnlineCountdownState(lobby: LobbyData, isHost: boolean, canvas: HTMLCanvasElement): GameState {
  const arenaWidth = ARENA_WIDTH_METERS;
  const arenaHeight = ARENA_HEIGHT_METERS;

  const selectedMapDef = getMapById(lobby.mapId) || getMapById('open')!;
  const mapObstacles = selectedMapDef.obstacles;
  
  // Add boundary obstacles to prevent units from getting stuck at screen edges
  const boundaryObstacles = createBoundaryObstacles(arenaWidth, arenaHeight);
  const obstacles = [...mapObstacles, ...boundaryObstacles];
  
  // Keep base placement aligned to the shared portrait coordinate system
  const basePositions = getValidBasePositions(arenaWidth, arenaHeight, obstacles, shouldUsePortraitCoordinates());
  
  // Generate topography lines and starfield for this level
  const topographyLines = generateTopographyLines(canvas.width, canvas.height);
  const stars = generateStarfield(canvas.width, canvas.height);
  const nebulaClouds = generateNebulaClouds(canvas.width, canvas.height);
  
  // Create mining depots in corners
  const miningDepots = createMiningDepots(arenaWidth, arenaHeight);

  // For online games, use standard base type for now
  const playerBaseTypeDef = BASE_TYPE_DEFINITIONS['standard'];
  const enemyBaseTypeDef = BASE_TYPE_DEFINITIONS['standard'];

  return {
    mode: 'countdown',
    vsMode: 'online',
    units: [],
    projectiles: [],
    obstacles: obstacles,
    miningDepots: miningDepots,
    bases: [
      {
        id: generateId(),
        owner: 0,
        position: basePositions.player,
        hp: playerBaseTypeDef.hp,
        maxHp: playerBaseTypeDef.hp,
        armor: playerBaseTypeDef.armor,
        movementTarget: null,
        rallyPoint: calculateDefaultRallyPoint(basePositions.player, basePositions.enemy),
        isSelected: false,
        laserCooldown: 0,
        faction: 'radiant',
        baseType: 'standard',
        autoAttackCooldown: 0,
      },
      {
        id: generateId(),
        owner: 1,
        position: basePositions.enemy,
        hp: enemyBaseTypeDef.hp,
        maxHp: enemyBaseTypeDef.hp,
        armor: enemyBaseTypeDef.armor,
        movementTarget: null,
        rallyPoint: calculateDefaultRallyPoint(basePositions.enemy, basePositions.player),
        isSelected: false,
        laserCooldown: 0,
        faction: 'radiant',
        baseType: 'standard',
        autoAttackCooldown: 0,
      },
    ],
    players: [
      { photons: 50, incomeRate: 1, color: isHost ? lobby.hostColor : lobby.guestColor || COLORS.playerDefault },
      { photons: 50, incomeRate: 1, color: isHost ? lobby.guestColor || COLORS.enemyDefault : lobby.hostColor },
    ],
    selectedUnits: new Set(),
    controlGroups: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set(), 8: new Set() },
    currentFormation: 'none',
    patrolMode: false,
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
      playerFaction: 'radiant',
      enemyFaction: 'radiant',
      playerBaseType: 'standard',
      enemyBaseType: 'standard',
    },
    surrenderClicks: 0,
    lastSurrenderClickTime: 0,
    surrenderExpanded: false,
    // Seed the countdown clock so the overlay starts at 3 and ticks down.
    countdownStartTime: Date.now(),
    countdownSeconds: 3,
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
    floaters: initializeFloaters(),
    // Keep gameplay coordinates consistent across devices
    isPortrait: shouldUsePortraitCoordinates(),
  };
}

export default App;
