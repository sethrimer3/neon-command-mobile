export interface MatchStats {
  matchId: string;
  timestamp: number;
  result: 'victory' | 'defeat' | 'surrender' | 'draw';
  vsMode: 'ai' | 'player' | 'online';
  opponentName?: string;
  opponentMMR?: number;
  mapId: string;
  duration: number;
  unitsTrainedByPlayer: number;
  unitsKilledByPlayer: number;
  damageDealtByPlayer: number;
  photonsSpentByPlayer: number;
  basesDestroyedByPlayer: number;
  finalPlayerColor: string;
  finalEnemyColor: string;
  mmrChange?: number;
  playerMMRBefore?: number;
  playerMMRAfter?: number;
  timeoutResult?: boolean;
}

export interface PlayerStatistics {
  totalMatches: number;
  victories: number;
  defeats: number;
  surrenders: number;
  draws: number;
  totalUnitsTrained: number;
  totalUnitsKilled: number;
  totalDamageDealt: number;
  totalPhotonsSpent: number;
  totalBasesDestroyed: number;
  totalPlayTime: number;
  matchHistory: MatchStats[];
  favoriteMap?: string;
  highestDamageMatch?: number;
  longestMatch?: number;
  shortestVictory?: number;
  mmr: number;
  peakMMR?: number;
}

export function createEmptyStatistics(): PlayerStatistics {
  return {
    totalMatches: 0,
    victories: 0,
    defeats: 0,
    surrenders: 0,
    draws: 0,
    totalUnitsTrained: 0,
    totalUnitsKilled: 0,
    totalDamageDealt: 0,
    totalPhotonsSpent: 0,
    totalBasesDestroyed: 0,
    totalPlayTime: 0,
    matchHistory: [],
    mmr: 1000,
    peakMMR: 1000,
  };
}

export function calculateMMRChange(
  playerMMR: number,
  opponentMMR: number,
  result: 'victory' | 'defeat' | 'draw',
  kFactor: number = 32
): number {
  const expectedScore = 1 / (1 + Math.pow(10, (opponentMMR - playerMMR) / 400));
  
  let actualScore: number;
  if (result === 'victory') {
    actualScore = 1;
  } else if (result === 'defeat') {
    actualScore = 0;
  } else {
    actualScore = 0.5;
  }
  
  return Math.round(kFactor * (actualScore - expectedScore));
}

export function updateStatistics(
  currentStats: PlayerStatistics,
  newMatch: MatchStats
): PlayerStatistics {
  const matchHistory = [newMatch, ...currentStats.matchHistory].slice(0, 50);

  const updated: PlayerStatistics = {
    totalMatches: currentStats.totalMatches + 1,
    victories: currentStats.victories + (newMatch.result === 'victory' ? 1 : 0),
    defeats: currentStats.defeats + (newMatch.result === 'defeat' ? 1 : 0),
    surrenders: currentStats.surrenders + (newMatch.result === 'surrender' ? 1 : 0),
    draws: currentStats.draws + (newMatch.result === 'draw' ? 1 : 0),
    totalUnitsTrained: currentStats.totalUnitsTrained + newMatch.unitsTrainedByPlayer,
    totalUnitsKilled: currentStats.totalUnitsKilled + newMatch.unitsKilledByPlayer,
    totalDamageDealt: currentStats.totalDamageDealt + newMatch.damageDealtByPlayer,
    totalPhotonsSpent: currentStats.totalPhotonsSpent + newMatch.photonsSpentByPlayer,
    totalBasesDestroyed: currentStats.totalBasesDestroyed + newMatch.basesDestroyedByPlayer,
    totalPlayTime: currentStats.totalPlayTime + newMatch.duration,
    matchHistory,
    mmr: newMatch.playerMMRAfter ?? currentStats.mmr,
    peakMMR: Math.max(currentStats.peakMMR || currentStats.mmr, newMatch.playerMMRAfter ?? currentStats.mmr),
  };

  const mapCounts: Record<string, number> = {};
  matchHistory.forEach(match => {
    mapCounts[match.mapId] = (mapCounts[match.mapId] || 0) + 1;
  });
  updated.favoriteMap = Object.entries(mapCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  updated.highestDamageMatch = Math.max(
    currentStats.highestDamageMatch || 0,
    newMatch.damageDealtByPlayer
  );

  updated.longestMatch = Math.max(
    currentStats.longestMatch || 0,
    newMatch.duration
  );

  if (newMatch.result === 'victory') {
    updated.shortestVictory = Math.min(
      currentStats.shortestVictory || Infinity,
      newMatch.duration
    );
    if (updated.shortestVictory === Infinity) {
      updated.shortestVictory = newMatch.duration;
    }
  } else {
    updated.shortestVictory = currentStats.shortestVictory;
  }

  return updated;
}

export function getWinRate(stats: PlayerStatistics): number {
  if (stats.totalMatches === 0) return 0;
  return (stats.victories / stats.totalMatches) * 100;
}

export function getAverageMatchDuration(stats: PlayerStatistics): number {
  if (stats.totalMatches === 0) return 0;
  return stats.totalPlayTime / stats.totalMatches;
}

export function getKillDeathRatio(stats: PlayerStatistics): number {
  const deaths = stats.defeats + stats.surrenders;
  if (deaths === 0) return stats.totalUnitsKilled;
  return stats.totalUnitsKilled / deaths;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}
