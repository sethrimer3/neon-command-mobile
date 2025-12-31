# statistics.ts

## Purpose
Manages player statistics, match history, and MMR (Matchmaking Rating) system. Tracks player performance across matches and calculates rating changes using ELO-style algorithm.

## Dependencies
### Imports
None - standalone utility module

### Used By
- `App.tsx` - Statistics tracking and updates
- `StatisticsScreen.tsx` - Statistics display
- `multiplayer.ts` - MMR calculations for online matches

## Key Components

### Types

#### MatchStats Interface
Records detailed information about a single match:
- **matchId**: Unique match identifier
- **timestamp**: When match was played
- **result**: 'victory', 'defeat', 'surrender', 'draw'
- **vsMode**: 'ai', 'player', 'online'
- **opponentName/MMR**: Opponent information (if applicable)
- **mapId**: Map played on
- **duration**: Match length in seconds
- **Performance metrics**: Units trained/killed, damage dealt, photons spent, bases destroyed
- **Player colors**: For visual match history
- **MMR data**: Changes and before/after values
- **timeoutResult**: If match ended by time limit

#### PlayerStatistics Interface
Aggregate statistics across all matches:
- **Match counts**: Total, victories, defeats, surrenders, draws
- **Aggregate totals**: Units, damage, resources, time
- **Match history**: Array of MatchStats (limited to 50)
- **Records**: Favorite map, highest damage, longest/shortest matches
- **MMR**: Current rating and peak

### Functions

#### createEmptyStatistics(): PlayerStatistics
- **Purpose:** Initialize new player statistics
- **Returns:** Empty stats with 1000 starting MMR
- **Notes:** Default starting point for new players

#### calculateMMRChange(playerMMR, opponentMMR, result, kFactor): number
- **Purpose:** Calculate rating change using ELO formula
- **Parameters:**
  - playerMMR: Current player rating
  - opponentMMR: Opponent rating
  - result: Match outcome
  - kFactor: Sensitivity (default 32)
- **Returns:** MMR change (positive or negative)
- **Notes:**
  - Expected score: 1 / (1 + 10^((opponentMMR - playerMMR) / 400))
  - Actual score: 1 (win), 0.5 (draw), 0 (loss)
  - Change: kFactor × (actual - expected)
  - Higher kFactor = more volatile ratings

#### updateStatistics(currentStats, newMatch): PlayerStatistics
- **Purpose:** Add new match to statistics
- **Parameters:** Current statistics and new match data
- **Returns:** Updated statistics object
- **Notes:**
  - Increments all relevant counters
  - Adds match to history (keeps last 50)
  - Updates records (favorite map, highest damage, etc.)
  - Applies MMR changes
  - Updates peak MMR if current exceeds it

## Terminology
- **MMR**: Matchmaking Rating (ELO-style)
- **ELO**: Rating system (chess origins)
- **K-Factor**: Rating change sensitivity
- **Expected Score**: Win probability based on ratings
- **Peak MMR**: Highest rating ever achieved
- **Aggregate Statistics**: Totals across all matches

## Implementation Notes

### Critical Details
- Starting MMR is 1000
- K-Factor of 32 is standard for moderate volatility
- Match history limited to 50 most recent matches
- MMR changes rounded to integers
- Expected score uses standard ELO formula with 400 divisor
- Draws give 0.5 actual score
- Peak MMR tracked separately and never decreases

### ELO Formula Breakdown
1. **Expected score** = probability of winning based on rating difference
2. **Rating diff** = opponentMMR - playerMMR
3. **Win probability** = 1 / (1 + 10^(diff/400))
4. **Rating change** = K × (actual - expected)

Example: 1000 vs 1200 rated opponent
- Expected: 1 / (1 + 10^(200/400)) = 0.24 (24% win chance)
- If win: 32 × (1 - 0.24) = +24 MMR
- If loss: 32 × (0 - 0.24) = -8 MMR

### Statistics Tracking
- All numeric stats are cumulative
- Match history is chronological (newest first)
- Favorite map determined by most played
- Records only update if new match exceeds previous

### Known Issues
- No rating decay for inactivity
- K-Factor doesn't adjust with games played
- MMR can become inflated over time

## Future Changes

### Planned
- None currently scheduled

### Needed
- Dynamic K-Factor (higher for new players, lower for veterans)
- Rating decay for inactive players
- Separate MMR per game mode (AI, local, online)
- Seasonal resets
- Leaderboards
- Percentile rankings
- Advanced analytics (win rate by unit, map win rates)
- Graph visualizations
- Match replay system
- Achievement tracking
- Daily/weekly statistics

## Change History
- Initial creation with basic statistics
- Added MMR system
- Implemented match history
- Added timeout result tracking

## Watch Out For
- MMR can go negative (clamp in UI if needed)
- Match history array grows unbounded without slicing to 50
- K-Factor affects rating volatility significantly
- Expected score formula requires opponent MMR (not available for AI)
- Surrenders count as defeats for MMR purposes
- Duration must be in seconds consistently
- MatchStats must include all required fields
- MMR change should be calculated before updating
- Peak MMR only updates upward
- Favorite map calculation needs mode (most frequent)
- Records (highest damage, etc.) need comparison logic
- Timestamp should be Date.now() for consistency
