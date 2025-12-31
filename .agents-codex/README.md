# Agents Codex Directory

This directory contains detailed documentation for every code file in the SoL-RTS project. These codex files are designed to help AI agents understand the codebase structure, dependencies, and implementation details.

## Purpose

The agents codex system serves multiple purposes:
1. **Context for AI Agents**: Provides comprehensive context about each file's role and relationships
2. **Onboarding Guide**: Helps new developers understand the codebase quickly
3. **Architecture Documentation**: Maintains up-to-date documentation of system design
4. **Change Tracking**: Records important implementation notes and future plans

## Structure

```
.agents-codex/
├── README.md (this file)
├── CONFIG_FILES.md (configuration files documentation)
└── src/
    ├── App.tsx.md
    ├── main.tsx.md
    ├── ErrorFallback.tsx.md
    ├── components/
    │   ├── SCREEN_COMPONENTS.md (overview of all screen components)
    │   └── ui/
    │       └── UI_COMPONENTS.md (overview of 46 shadcn/ui components)
    ├── hooks/
    │   └── use-mobile.ts.md
    └── lib/
        ├── types.ts.md
        ├── gameUtils.ts.md
        ├── simulation.ts.md
        ├── ai.ts.md
        ├── renderer.ts.md
        ├── input.ts.md
        ├── maps.ts.md
        ├── multiplayer.ts.md
        ├── sound.ts.md
        ├── statistics.ts.md
        └── utils.ts.md
```

## Coverage

### Core Library Files (11 files)
- **types.ts**: All type definitions and constants
- **gameUtils.ts**: Vector math and utility functions
- **simulation.ts**: Game loop and mechanics
- **ai.ts**: AI opponent logic
- **renderer.ts**: Canvas rendering system
- **input.ts**: Touch/mouse input handling
- **maps.ts**: Map definitions and collision detection
- **multiplayer.ts**: Online multiplayer system
- **sound.ts**: Audio management
- **statistics.ts**: Player stats and MMR
- **utils.ts**: Tailwind CSS utilities

### Application Files (3 files)
- **App.tsx**: Main application orchestrator
- **main.tsx**: Entry point
- **ErrorFallback.tsx**: Error handling UI

### Component Files (2 overview files)
- **SCREEN_COMPONENTS.md**: Documents 6 game screens (unit selection, map selection, etc.)
- **UI_COMPONENTS.md**: Documents 46 shadcn/ui components

### Hooks (1 file)
- **use-mobile.ts**: Mobile device detection

### Configuration (1 overview file)
- **CONFIG_FILES.md**: Documents tailwind.config.js, vite.config.ts, tsconfig.json

## Total Documentation
- **18 individual codex files**
- **3 overview files** (covering 55 additional files)
- **1 main guidelines file** (agents.md in project root)
- **~3,000 lines of documentation**

## Codex File Format

Each codex file follows this structure:

1. **Purpose**: What the file does and why it exists
2. **Dependencies**: What it imports and what imports it
3. **Key Components**: Major functions, classes, or exports
4. **Terminology**: Domain-specific terms explained
5. **Implementation Notes**: Critical details and gotchas
6. **Future Changes**: Planned improvements and needed refactors
7. **Change History**: Log of significant modifications
8. **Watch Out For**: Common pitfalls and important considerations

## Usage Guidelines

### For AI Agents
1. Read the main `agents.md` file first for overall guidelines
2. Reference codex files when working on specific features
3. Update codex files when making changes
4. Document new terminology and patterns
5. Flag unused code in the appropriate codex file

### For Developers
1. Use as onboarding material for new team members
2. Reference when planning refactors
3. Update after making significant changes
4. Add notes about discovered edge cases or bugs
5. Document architectural decisions

### For Code Reviews
1. Check if codex files were updated with changes
2. Verify accuracy of implementation notes
3. Suggest additions for complex changes
4. Ensure terminology remains current

## Maintenance

### When to Update
- **Always**: When file functionality changes significantly
- **Often**: When discovering important implementation details
- **Sometimes**: When fixing bugs (note the issue)
- **Rarely**: For minor refactors or style changes

### What to Update
- Dependencies if imports change
- Key components if functions added/removed
- Implementation notes if critical details discovered
- Future changes if plans evolve
- Watch out for section if pitfalls found

### Keep It Current
- Review codex files periodically (quarterly)
- Remove outdated information
- Consolidate related notes
- Maintain consistent formatting

## Benefits

1. **Faster Development**: Understanding context speeds up feature development
2. **Better Onboarding**: New team members get up to speed quickly
3. **Reduced Bugs**: Understanding relationships prevents breaking changes
4. **Improved Refactoring**: Clear documentation enables confident refactors
5. **Knowledge Preservation**: Important details aren't lost when team members leave

## Related Files

- `/agents.md` - Main guidelines for AI agents working on this project
- `/README.md` - Project overview and setup instructions
- `/PRD.md` - Product requirements document
- `/SECURITY.md` - Security policies
- `/SOUND_SYSTEM.md` - Audio system documentation

## Questions?

If you have questions about:
- How to use the codex system
- What level of detail to include
- When to update files
- How to structure new codex files

Refer to the main `agents.md` file in the project root, or follow the existing patterns in this directory.

---

**Remember**: Good documentation is maintained documentation. Keep these files current and they'll continue to provide value to the team and AI agents.
