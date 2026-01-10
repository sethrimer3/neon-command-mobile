# Agents Documentation Guidelines

## Build Information
**Current Build Number:** 38

**IMPORTANT:** With each pull request, you must increment the build number by one in TWO places:
1. Update the build number in this file (agents.md)
2. Update the build number in index.html (the `<div id="build-badge">BUILD X</div>` line)

## Purpose
This document provides guidelines for AI agents working with the SoL-RTS codebase. Following these guidelines ensures code quality, maintainability, and effective collaboration between agents and developers.

## Core Principles

### 1. Code Comments
**Leave comments on every reasonable chunk of code explaining what it does.**

- Add comments for complex logic, algorithms, or non-obvious behavior
- Document function purposes, parameters, and return values
- Explain WHY code does something, not just WHAT it does
- Use inline comments for tricky sections within functions
- Keep comments up-to-date when code changes

**Good Examples:**
```typescript
// Calculate damage with promotion multiplier based on distance traveled
const effectiveDamage = baseDamage * unit.damageMultiplier;

/**
 * Processes unit movement and updates position based on command queue.
 * Handles collision detection and applies speed modifiers.
 * @param unit - The unit to move
 * @param deltaTime - Time elapsed since last update in seconds
 * @returns Updated unit position
 */
function processUnitMovement(unit: Unit, deltaTime: number): Vector2 { ... }
```

**Avoid:**
```typescript
// Bad: States the obvious
let x = 5; // Set x to 5

// Bad: Redundant
function getUser() { ... } // Gets user
```

### 2. Report Unused Code
**Identify and report unused sections of code or features.**

When you encounter code that appears to be:
- Unused functions or variables
- Dead code paths
- Commented-out code blocks
- Deprecated features still in the codebase
- Redundant implementations

**Action:** Document findings in the corresponding `.agents-codex` file under a "Potential Issues" or "Unused Code" section. Include:
- Location (file and line numbers)
- Description of the unused code
- Reason why it appears unused
- Recommendation (remove, refactor, or investigate further)

**Example:**
```markdown
## Potential Issues

### Unused Code
- **Location:** `src/lib/gameUtils.ts:145-167`
- **Description:** `calculateOldPathfinding()` function
- **Reason:** Replaced by `calculateNewPathfinding()` in v2.0, no references found
- **Recommendation:** Remove after confirming with team
```

### 3. Update Codex Files
**Update the associated agents codex file if changes were made.**

Whenever you modify a file:
1. Update the corresponding `.agents-codex/<filename>.md` file
2. Document what changed and why
3. Update dependencies if new imports were added
4. Add any new terminology or concepts
5. Note any breaking changes or migration needs

## Agents Codex System

### Directory Structure
All codex files are stored in `.agents-codex/` directory, mirroring the source structure:

```
.agents-codex/
├── src/
│   ├── App.tsx.md
│   ├── lib/
│   │   ├── types.ts.md
│   │   ├── simulation.ts.md
│   │   └── ...
│   └── components/
│       ├── UnitSelectionScreen.tsx.md
│       └── ...
├── tailwind.config.js.md
└── vite.config.ts.md
```

### Codex File Format

Each codex file should follow this structure:

```markdown
# [Filename]

## Purpose
Brief description of what this file does and its role in the project.

## Dependencies
### Imports
- List of files this file imports from
- External libraries used

### Used By
- List of files that import this file
- Where this code is utilized

## Key Components
### [Component/Function Name]
- **Purpose:** What it does
- **Parameters:** If applicable
- **Returns:** If applicable
- **Notes:** Important implementation details

## Terminology
- **Term:** Definition specific to this file's context
- **Abbreviation:** What it stands for and means

## Implementation Notes
### Critical Details
- Important algorithms or patterns used
- Performance considerations
- Edge cases handled

### Known Issues
- Current bugs or limitations
- Workarounds in place

## Future Changes
### Planned
- Features or refactors planned for this file
- Technical debt to address

### Needed
- Improvements identified by agents or developers
- Optimization opportunities

## Change History
- **[Date]:** Description of significant changes made
- Use this to track evolution of the file

## Watch Out For
- Common pitfalls when editing this file
- Areas requiring extra care
- Security considerations
```

## Best Practices

### When Adding New Code
1. Follow existing code style and patterns
2. Add appropriate comments as you code
3. Create or update the codex file
4. Document any new terminology
5. Note dependencies added

### When Reviewing Code
1. Check for unused imports or functions
2. Verify comments are accurate and helpful
3. Update codex files with new information
4. Flag code smells or improvement opportunities

### When Debugging
1. Document the issue in the codex file
2. Add comments explaining the fix
3. Note edge cases discovered
4. Update "Watch Out For" section

### When Refactoring
1. Update all affected codex files
2. Note breaking changes
3. Update dependency lists
4. Document migration path if needed

## File-Specific Guidelines

### TypeScript/JavaScript Files
- Use JSDoc comments for functions
- Document type definitions
- Explain complex type guards or generics
- Note any `any` types and why they're needed

### React Components
- Document component purpose and props
- Explain state management approach
- Note any lifecycle considerations
- Document event handlers

### Configuration Files
- Explain each configuration option
- Document environment-specific settings
- Note dependencies between config values

## Security Considerations
When working with code:
- Flag hardcoded credentials or secrets
- Note authentication/authorization logic
- Document input validation and sanitization
- Report potential security vulnerabilities

## Performance Considerations
- Document performance-critical sections
- Note optimization opportunities
- Explain caching strategies
- Report potential bottlenecks

## Testing Requirements
- Note which code lacks tests
- Document test coverage gaps
- Suggest test cases for complex logic
- Update codex when test requirements change

## Communication
When documenting in codex files:
- Be clear and concise
- Use examples when helpful
- Keep information current
- Don't duplicate information from code comments
- Focus on context and reasoning

## Maintenance
- Review and update codex files regularly
- Remove outdated information
- Consolidate related notes
- Keep consistent formatting

## Questions?
If you're unsure about:
- Whether code is unused
- How to document something
- What level of detail to include

**Default to including it.** More documentation is better than less, as long as it's accurate and useful.

---

## Maintaining the Unit Information Page

The Unit Information page (`/src/components/UnitInformationScreen.tsx`) provides a comprehensive database of all units organized by faction. When making changes to units, **always update this page** to keep it synchronized with the codebase.

### When to Update

Update the Unit Information page whenever you:
- Add a new unit type
- Modify unit stats (HP, armor, speed, attack damage, etc.)
- Change unit modifiers (melee, ranged, flying, small, healing)
- Update unit abilities (name, cooldown, or behavior)
- Add or change unit attack types
- Modify faction definitions or available units

### What to Update

1. **Unit Stats**: Ensure all stat displays match `UNIT_DEFINITIONS` in `/src/lib/types.ts`
   - HP, armor, move speed
   - Attack range, damage, and rate
   - Cost and ability cooldown

2. **Ability Descriptions**: Update the `getAbilityDescription()` function with:
   - Accurate damage values from `/src/lib/simulation.ts`
   - Correct range and area of effect
   - Duration and special effects
   - Any modifications to ability behavior

3. **Attack Descriptions**: Verify the `getAttackDescription()` function accurately reflects:
   - Attack type (melee/ranged/none)
   - Damage values
   - Range
   - Attack rate
   - Armor interaction notes

4. **Unit Icons**: If adding new units, add appropriate emoji icons in `getUnitIcon()` function

5. **Faction Information**: Update faction headers if faction definitions change:
   - Available units list
   - Base speed
   - Base shape
   - Faction ability

### How to Update

1. **Locate the change in types.ts**: Find the unit definition in `UNIT_DEFINITIONS`
2. **Update ability description**: Modify `getAbilityDescription()` function with new damage/behavior
3. **Check simulation.ts**: Verify ability implementation matches your description
4. **Test the display**: Run the app and navigate to Unit Information to verify changes appear correctly

### Example Update Workflow

If you modify the Marine unit's burst fire ability:
```typescript
// 1. Update types.ts with new stats
marine: {
  ...
  attackDamage: 7, // changed from 6
  ...
}

// 2. Update simulation.ts ability implementation
function executeBurstFire(...) {
  const shotDamage = 3 * unit.damageMultiplier; // changed from 2
  ...
}

// 3. Update UnitInformationScreen.tsx description
marine: 'Fires 10 rapid shots in a cone, each dealing 3 damage...' // changed from 2
```

### Verification Checklist

Before completing changes to units, verify:
- [ ] Unit stats in UnitInformationScreen match UNIT_DEFINITIONS
- [ ] Ability descriptions include correct damage values from simulation.ts
- [ ] Attack descriptions accurately reflect attack type and behavior
- [ ] All new units have entries in ability/attack description functions
- [ ] Faction organization is correct (units listed under right faction)
- [ ] Test the page renders without errors

**Remember**: The Unit Information page is a player-facing feature. Accuracy is critical for gameplay understanding and balance perception.

---

Remember: The goal is to make the codebase easier to understand, maintain, and improve for both AI agents and human developers. Your documentation efforts directly contribute to the project's long-term success.
