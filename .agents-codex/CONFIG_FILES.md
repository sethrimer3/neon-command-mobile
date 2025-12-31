# Configuration Files

## tailwind.config.js

### Purpose
Configures Tailwind CSS for the project. Defines custom theme, colors, spacing, and responsive breakpoints. Loads custom theme from theme.json if available.

### Dependencies
- `fs` - File system for reading theme.json
- `tailwindcss` - CSS framework

### Used By
- All component and style files
- Vite build process

### Key Configuration

#### Content Paths
- `./index.html` - HTML entry point
- `./src/**/*.{js,ts,jsx,tsx}` - All source files

#### Theme Extension
- **Custom Screens**: coarse/fine pointer, PWA mode detection
- **Color System**: CSS variable-based colors (neutral, accent, accent-secondary, fg, bg)
- **Border Radius**: CSS variable-based radii
- **Spacing**: CSS variable-based spacing scale
- **Dark Mode**: Class-based with `[data-appearance="dark"]`

#### Custom Colors
- Neutral: 12-step scale + alpha variants (1-12, a1-a12, contrast)
- Accent: Primary brand color scale
- Accent Secondary: Secondary brand color scale
- Foreground/Background: Semantic colors

### Implementation Notes
- Loads custom theme from theme.json (optional)
- Falls back to default theme if theme.json missing
- Uses CSS variables for dynamic theming
- Container centered with 2rem padding
- Custom breakpoints for device capabilities

### Watch Out For
- theme.json must be valid JSON
- CSS variables must be defined in CSS files
- Dark mode requires data-appearance attribute
- Color scales must use var() references
- Spacing scale must match design tokens

---

## vite.config.ts

### Purpose
Configures Vite build tool. Sets up plugins for React, Tailwind, Spark framework, and icon proxying. Defines path aliases.

### Dependencies
- `@vitejs/plugin-react-swc` - React with SWC compiler
- `@tailwindcss/vite` - Tailwind CSS plugin
- `@github/spark/*` - Spark framework plugins
- `vite` - Build tool

### Used By
- Development server
- Production build
- Type checking

### Key Configuration

#### Plugins (in order)
1. **react()** - React SWC compilation
2. **tailwindcss()** - CSS processing
3. **createIconImportProxy()** - Phosphor icon optimization
4. **sparkPlugin()** - Spark framework integration

#### Path Alias
- `@` → `src/` - Absolute imports from src

### Implementation Notes
- SWC used for faster compilation than Babel
- Icon proxy reduces bundle size
- Spark plugin required for Spark features
- Path alias enables cleaner imports
- PROJECT_ROOT environment variable support

### Watch Out For
- Plugin order matters (DO NOT REMOVE comment)
- Spark plugins must be PluginOption type
- Path alias must match tsconfig.json
- Icon proxy must come before Spark plugin

---

## tsconfig.json

### Purpose
TypeScript compiler configuration. Defines compiler options, module resolution, and type checking rules.

### Used By
- TypeScript compiler
- VS Code IntelliSense
- Build process

### Key Configuration

#### Compiler Options
- **Target**: ES2020 JavaScript
- **Module**: ESNext with bundler resolution
- **JSX**: React JSX transform
- **Lib**: ES2020, DOM, DOM.Iterable
- **Strict Null Checks**: Enabled
- **Skip Lib Check**: true (performance)

#### Module Resolution
- **Type**: bundler mode
- **Allow TS Extensions**: true
- **Isolated Modules**: true (for SWC)
- **No Emit**: true (Vite handles build)

#### Path Mapping
- `@/*` → `./src/*` - Matches Vite alias

#### Linting
- No fallthrough cases in switch
- No unchecked side effect imports

### Implementation Notes
- Modern ES2020 target for smaller output
- Bundler resolution for Vite compatibility
- Path mapping for clean imports
- Strict null checks for safety
- No emit because Vite handles bundling

### Watch Out For
- Path alias must match vite.config.ts
- Target must support all used features
- JSX setting affects React import style
- Skip lib check speeds up but may hide issues
- Isolated modules required for SWC/Vite
- Include only src directory for compilation
