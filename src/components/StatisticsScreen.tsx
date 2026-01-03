import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { ArrowLeft, Trophy, Sword, Target, Lightning, Clock, TrendUp, Equals } from '@phosphor-icons/react';
import { PlayerStatistics, formatDuration, formatDate, getWinRate, getAverageMatchDuration } from '../lib/statistics';
import { getMapById } from '../lib/maps';

interface StatisticsScreenProps {
  statistics: PlayerStatistics;
  onBack: () => void;
}

export function StatisticsScreen({ statistics, onBack }: StatisticsScreenProps) {
  const winRate = getWinRate(statistics);
  const avgDuration = getAverageMatchDuration(statistics);

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
      <Card className="w-[800px] max-w-full flex flex-col my-auto">
        <CardHeader>
          <CardTitle className="orbitron text-3xl text-center text-primary">Player Statistics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-secondary/30 p-4 rounded-lg text-center">
              <Trophy className="mx-auto mb-2 text-primary" size={32} />
              <div className="text-2xl font-bold orbitron">{statistics.victories}</div>
              <div className="text-xs text-muted-foreground uppercase">Victories</div>
            </div>

            <div className="bg-secondary/30 p-4 rounded-lg text-center">
              <Target className="mx-auto mb-2 text-destructive" size={32} />
              <div className="text-2xl font-bold orbitron">{statistics.defeats}</div>
              <div className="text-xs text-muted-foreground uppercase">Defeats</div>
            </div>

            <div className="bg-secondary/30 p-4 rounded-lg text-center">
              <Equals className="mx-auto mb-2 text-accent" size={32} />
              <div className="text-2xl font-bold orbitron">{statistics.draws}</div>
              <div className="text-xs text-muted-foreground uppercase">Draws</div>
            </div>

            <div className="bg-secondary/30 p-4 rounded-lg text-center">
              <Sword className="mx-auto mb-2 text-accent" size={32} />
              <div className="text-2xl font-bold orbitron">{statistics.totalUnitsKilled}</div>
              <div className="text-xs text-muted-foreground uppercase">Kills</div>
            </div>

            <div className="bg-secondary/30 p-4 rounded-lg text-center">
              <Clock className="mx-auto mb-2 text-primary" size={32} />
              <div className="text-2xl font-bold orbitron">{statistics.totalMatches}</div>
              <div className="text-xs text-muted-foreground uppercase">Matches</div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary/20 to-accent/20 p-6 rounded-lg border-2 border-primary/50">
            <div className="flex items-center justify-center gap-4 mb-2">
              <TrendUp className="text-primary" size={32} />
              <div className="text-center">
                <div className="text-4xl font-black orbitron text-primary">{statistics.mmr}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Match Making Rating</div>
              </div>
            </div>
            {statistics.peakMMR && statistics.peakMMR > statistics.mmr && (
              <div className="text-center text-xs text-muted-foreground mt-2">
                Peak MMR: <span className="font-bold text-foreground">{statistics.peakMMR}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-secondary/20 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground uppercase">Win Rate</span>
                <TrendUp className="text-primary" size={20} />
              </div>
              <div className="text-2xl font-bold orbitron">{winRate.toFixed(1)}%</div>
            </div>

            <div className="bg-secondary/20 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground uppercase">Avg. Match Time</span>
                <Clock className="text-primary" size={20} />
              </div>
              <div className="text-2xl font-bold orbitron">{formatDuration(avgDuration)}</div>
            </div>

            <div className="bg-secondary/20 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground uppercase">Total Damage</span>
                <Lightning className="text-accent" size={20} />
              </div>
              <div className="text-2xl font-bold orbitron">{statistics.totalDamageDealt.toLocaleString()}</div>
            </div>

            <div className="bg-secondary/20 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground uppercase">Units Trained</span>
                <Sword className="text-primary" size={20} />
              </div>
              <div className="text-2xl font-bold orbitron">{statistics.totalUnitsTrained}</div>
            </div>
          </div>

          {statistics.highestDamageMatch !== undefined && statistics.highestDamageMatch > 0 && (
            <div className="bg-primary/10 border border-primary/30 p-4 rounded-lg">
              <div className="text-sm text-muted-foreground uppercase mb-2">Personal Records</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Highest Damage:</span>
                  <span className="ml-2 font-bold text-primary">{statistics.highestDamageMatch.toLocaleString()}</span>
                </div>
                {statistics.shortestVictory && (
                  <div>
                    <span className="text-muted-foreground">Fastest Victory:</span>
                    <span className="ml-2 font-bold text-primary">{formatDuration(statistics.shortestVictory)}</span>
                  </div>
                )}
                {statistics.longestMatch && (
                  <div>
                    <span className="text-muted-foreground">Longest Match:</span>
                    <span className="ml-2 font-bold text-primary">{formatDuration(statistics.longestMatch)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold orbitron">Match History</h3>
              <Badge variant="secondary">{statistics.matchHistory.length} matches</Badge>
            </div>
            <Separator className="mb-3" />
            
            {statistics.matchHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Trophy size={48} className="mx-auto mb-2 opacity-30" />
                <p>No matches played yet</p>
                <p className="text-sm mt-1">Play your first match to start tracking statistics!</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {statistics.matchHistory.map((match, index) => (
                    <div
                      key={match.matchId}
                      className={`p-3 rounded-lg border ${
                        match.result === 'victory'
                          ? 'bg-primary/10 border-primary/30'
                          : match.result === 'surrender'
                          ? 'bg-muted/20 border-muted-foreground/20'
                          : match.result === 'draw'
                          ? 'bg-accent/10 border-accent/30'
                          : 'bg-destructive/10 border-destructive/30'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              match.result === 'victory'
                                ? 'default'
                                : match.result === 'surrender'
                                ? 'secondary'
                                : match.result === 'draw'
                                ? 'outline'
                                : 'destructive'
                            }
                            className="orbitron text-xs"
                          >
                            {match.result.toUpperCase()}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatDate(match.timestamp)}
                          </span>
                          {match.mmrChange !== undefined && (
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                match.mmrChange > 0
                                  ? 'text-primary border-primary'
                                  : match.mmrChange < 0
                                  ? 'text-destructive border-destructive'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {match.mmrChange > 0 ? '+' : ''}{match.mmrChange} MMR
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground space-mono">
                          {formatDuration(match.duration)}
                        </div>
                      </div>

                      <div className="text-sm mb-2">
                        <span className="text-muted-foreground">Map:</span>
                        <span className="ml-2 font-semibold">
                          {getMapById(match.mapId)?.name || match.mapId}
                        </span>
                        <span className="ml-3 text-muted-foreground">Mode:</span>
                        <span className="ml-2 capitalize">{match.vsMode}</span>
                        {match.opponentName && (
                          <>
                            <span className="ml-3 text-muted-foreground">vs</span>
                            <span className="ml-2">{match.opponentName}</span>
                          </>
                        )}
                        {match.timeoutResult && (
                          <Badge variant="secondary" className="ml-2 text-xs">TIME</Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Units:</span>
                          <span className="ml-1 font-semibold">{match.unitsTrainedByPlayer}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Kills:</span>
                          <span className="ml-1 font-semibold">{match.unitsKilledByPlayer}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Damage:</span>
                          <span className="ml-1 font-semibold">{match.damageDealtByPlayer.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <Button onClick={onBack} className="w-full orbitron" variant="outline">
            <ArrowLeft className="mr-2" size={20} />
            Back to Menu
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
