# sound.ts

## Purpose
Manages all game audio including sound effects and music. Uses Web Audio API to generate procedural sounds for game events while supporting optional audio file playback. Provides volume controls and enable/disable functionality.

## Dependencies
### Imports
None - pure browser APIs

### Used By
- `App.tsx` - Sound initialization and volume control
- `simulation.ts` - Game event sounds (combat, abilities)
- `input.ts` - UI interaction sounds

## Key Components

### SoundManager Class

#### Properties
- **audioContext**: Web Audio API context
- **sfxVolume**: Sound effects volume (0-1)
- **musicVolume**: Music volume (0-1)
- **enabled**: Master on/off switch
- **audioFiles**: Map of loaded audio files for direct playback

#### Constructor
- **Purpose:** Initialize audio context
- **Notes:** Handles browser prefixes (webkit)

#### Volume Control Methods
- **setEnabled(enabled)**: Master on/off
- **setSfxVolume(volume)**: Set effects volume (clamped 0-1)
- **setMusicVolume(volume)**: Set music volume (clamped 0-1)
- **getSfxVolume/getMusicVolume()**: Get current volumes

#### ensureAudioContext(): Promise<boolean>
- **Purpose:** Resume suspended audio context
- **Notes:** Required for browser autoplay policies

#### playTone(frequency, duration, type, volume)
- **Purpose:** Generate synthesized tone
- **Parameters:**
  - frequency: Pitch in Hz
  - duration: Length in seconds
  - type: Waveform ('sine', 'square', 'sawtooth', 'triangle')
  - volume: Base volume (scaled by sfxVolume)
- **Notes:** Uses oscillator with exponential decay

#### playNoise(duration, volume)
- **Purpose:** Generate white noise burst
- **Notes:** Used for explosion/impact effects

### Sound Effect Methods
Each method plays a specific game sound:
- **playUnitSelect()**: Unit selection click (800Hz, 0.05s)
- **playUnitCommand()**: Command issued (600Hz, 0.08s)
- **playUnitSpawn()**: Unit created (400→600Hz sweep)
- **playUnitDeath()**: Unit destroyed (noise burst)
- **playBaseHit()**: Base damaged (200Hz, 0.15s)
- **playAbility()**: Ability activated (1200Hz, 0.12s)
- **playVictory()**: Match won (ascending tones)
- **playDefeat()**: Match lost (descending tones)
- **playIncomeTick()**: Resource gained (1000Hz, 0.03s)
- **playLaserFire()**: Base laser (noise + tone)
- **playCountdownTick()**: Timer sound (600→800Hz)
- **playMatchStart()**: Game begin (ascending sweep)
- **playSettingChange()**: Settings toggle feedback (audio file or tone fallback)

### soundManager Export
- **Purpose:** Singleton instance
- **Notes:** Imported by other modules

## Terminology
- **Web Audio API**: Browser audio system
- **Oscillator**: Tone generator
- **Gain Node**: Volume control
- **Buffer**: Audio data container
- **Audio Context**: Audio processing pipeline
- **Autoplay Policy**: Browser restriction on audio playback

## Implementation Notes

### Critical Details
- Procedural sounds are the default, with optional audio file playback for key cues
- Audio context may be suspended until user interaction
- Volume values clamped to [0, 1] range
- SFX volume multiplied with individual sound volumes
- Exponential decay creates natural sound fade
- White noise generated from random samples
- Audio file playback uses `playAudioFile` when a matching key is loaded

### Web Audio API Usage
1. Create oscillator or buffer source
2. Create gain node for volume
3. Connect nodes: source → gain → destination
4. Schedule start and stop times
5. Apply volume envelopes

### Browser Compatibility
- Handles webkit prefix for Safari
- Checks for window availability (SSR safety)
- Resumes context for autoplay policy compliance

### Known Issues
- Audio context may need user interaction to start
- Some browsers limit simultaneous sounds

## Future Changes

### Planned
- None currently scheduled

### Needed
- Preload audio files for richer sounds
- Spatial audio (3D positioning)
- Reverb and effects
- Music tracks with looping
- Sound themes/packs
- Pitch variation for repeated sounds
- Dynamic mixing based on game intensity
- Accessibility options (visual sound indicators)

## Change History
- Initial creation with procedural sounds
- Added all game event sounds
- Implemented volume controls
- **2025-03-22**: Added audio file fallbacks for key UI/gameplay cues and settings feedback.

## Watch Out For
- Audio context must be resumed on first user interaction
- All volumes must be clamped [0, 1]
- Oscillators are one-time use (create new for each sound)
- Stop time must be after start time
- ExponentialRampToValue requires value > 0 (use 0.01, not 0)
- Buffer creation requires sample rate match
- Gain node volume affected by both sfxVolume and sound volume
- Audio context null check required throughout
- Enabled flag checked before playing any sound
- Music files need 'music_' prefix for volume updates
- Duration in seconds, not milliseconds
- Frequency values are in Hz
