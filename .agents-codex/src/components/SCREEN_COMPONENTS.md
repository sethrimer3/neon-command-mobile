# Screen Components Overview

This directory contains UI screen components that handle different game modes and menus. Each component is a full-screen overlay with specific functionality.

## Components

### UnitSelectionScreen.tsx
- **Purpose:** Interface for selecting which units to assign to spawn shortcuts (left/up/down/right swipes)
- **Dependencies:** UI components, type definitions
- **Key Features:**
  - Visual unit icons with SVG
  - Faction logo assets resolve with the Vite base path for GitHub Pages
  - Slot assignment (4 slots: left, up, down, right)
  - Interactive unit selection
  - Color customization per player
- **Props:** unitSlots, onSlotChange, onBack, playerColor
- **Used By:** App.tsx when in 'unitSelection' mode

### MapSelectionScreen.tsx
- **Purpose:** Browse and select game maps
- **Dependencies:** UI components, maps library
- **Key Features:**
  - Grid of available maps
  - Map preview cards with name and description
  - Visual representation of obstacles
  - Selection persistence
- **Props:** selectedMap, onSelectMap, onBack
- **Used By:** App.tsx when in 'mapSelection' mode

### LevelSelectionScreen.tsx
- **Purpose:** Select AI difficulty and start single-player match
- **Dependencies:** UI components
- **Key Features:**
  - Difficulty options (Easy, Medium, Hard)
  - Optional time limits
  - Match customization
- **Props:** onStartGame, onBack
- **Used By:** App.tsx when in 'levelSelection' mode

### OnlineModeScreen.tsx
- **Purpose:** Browse multiplayer lobbies and create/join games
- **Dependencies:** UI components, multiplayer system
- **Key Features:**
  - Lobby list with status
  - Create new lobby
  - Join existing games
  - Refresh functionality
- **Props:** lobbies, userId, onRefresh, onCreateLobby, onJoinLobby, onBack
- **Used By:** App.tsx when in 'onlineMode' mode

### MultiplayerLobbyScreen.tsx
- **Purpose:** Pre-game lobby for online multiplayer
- **Dependencies:** UI components, multiplayer types
- **Key Features:**
  - Show host and guest info
  - Ready status indicators
  - Start game countdown
  - Leave lobby option
- **Props:** lobby, userId, onReady, onStart, onLeave
- **Used By:** App.tsx when in 'multiplayerLobby' mode

### StatisticsScreen.tsx
- **Purpose:** Display player statistics and match history
- **Dependencies:** UI components, statistics types
- **Key Features:**
  - Aggregate statistics (wins, losses, totals)
  - Match history list
  - MMR display
  - Performance metrics
  - Win/loss charts
- **Props:** statistics, onBack
- **Used By:** App.tsx when in 'statistics' mode

## Common Patterns

All screen components follow these patterns:
- Full-screen Card layout
- Back button to return to menu
- Props-based data flow (no direct state access)
- Callback props for actions
- Consistent styling with shadcn/ui
- Responsive design

## Terminology
- **Screen Component**: Full-screen UI overlay
- **Props Flow**: Parent component controls state
- **Callback Pattern**: Child notifies parent of actions via functions
- **Mode**: App.tsx state that determines which screen to show

## Implementation Notes

### Common Dependencies
- All use shadcn/ui components (Card, Button, etc.)
- All import types from ./lib/types
- All use Phosphor icons for UI elements
- All follow similar layout structure

### Navigation Pattern
- Each screen has onBack callback
- App.tsx switches screens via mode state
- No client-side routing (single-page app)

### State Management
- Screens are stateless (or minimal local state)
- Game state managed in App.tsx
- Settings persisted via useKV in App.tsx

## Watch Out For
- Screens assume props are non-null (no defensive checks)
- Back navigation must update App.tsx mode
- Color customization requires OKLCH color strings
- Map selection must validate map exists
- Lobby status changes trigger game start
- Statistics calculations happen in parent
- SVG icons must match unit types exactly
