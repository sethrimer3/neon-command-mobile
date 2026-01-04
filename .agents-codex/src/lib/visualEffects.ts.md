# visualEffects.ts

## Purpose
Provides particle, pulse, and ability visual effects used throughout the game. This module builds reusable helpers for combat impacts, ability telegraphs, and scene feedback.

## Dependencies
### Imports
- `./types` - Game types used for particle state
- `./gameUtils` - ID generation for particle entries

### Used By
- `simulation.ts` - Triggers ability effects, spawn effects, and hit sparks
- `input.ts` - Triggers spawn effects and laser particles for UI-driven actions

## Key Components

### createAbilityEffect(state, unit, position, abilityType): void
- **Purpose:** Dispatches ability-specific VFX based on a string key
- **Parameters:** Game state, source unit, target position, and ability type identifier
- **Notes:** Centralizes ability visuals so simulation can call a single helper

### createHitSparks(state, position, color, count): void
- **Purpose:** Emits spark particles for hits and impacts
- **Parameters:** Impact location, color, and particle count
- **Notes:** Used for melee and ranged damage feedback

### createEnergyPulse(state, position, color, radius, duration): void
- **Purpose:** Creates a radial pulse effect for ability activations
- **Parameters:** Position, color, radius, and duration

## Terminology
- **VFX:** Visual effects used to convey combat or ability feedback
- **Pulse:** Expanding ring effect used for abilities
- **Telegraph:** A charge or warning effect before an ability fires

## Implementation Notes

### Critical Details
- Ability effect keys must stay in sync with simulation ability triggers
- Particle systems reuse shared helpers to keep visual consistency

### Known Issues
- None currently identified

## Future Changes

### Planned
- Add more ability-specific effects as new units are introduced

### Needed
- Consider moving ability effect keys to shared constants to avoid mismatches

## Change History
- **2026-01-07:** Removed the execute-dash ability visual effect now that warriors only use the shared laser ability.

## Watch Out For
- Keep abilityType strings consistent between simulation.ts and this module
- Avoid allocating excessive particles for performance-critical scenes
