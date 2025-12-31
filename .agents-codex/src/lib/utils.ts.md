# utils.ts

## Purpose
Utility function for CSS class name merging. Combines Tailwind CSS classes intelligently, handling conflicts and conditional classes. Essential for component styling with Tailwind.

## Dependencies
### Imports
- `clsx` - Conditional class name construction
- `tailwind-merge` - Merges Tailwind classes without conflicts

### Used By
- All React component files
- Any file using Tailwind CSS classes dynamically

## Key Components

### cn(...inputs: ClassValue[]): string
- **Purpose:** Merge and deduplicate CSS class names
- **Parameters:** Variable number of class values (strings, objects, arrays)
- **Returns:** Merged class name string
- **Notes:**
  - Uses clsx to handle conditional classes
  - Uses twMerge to resolve Tailwind conflicts
  - Later classes override earlier ones

## Terminology
- **ClassValue**: Type from clsx (string, object, array, etc.)
- **Tailwind Merge**: Resolves conflicting Tailwind utility classes
- **clsx**: Conditional class name builder

## Implementation Notes

### Critical Details
- Essential for Tailwind CSS projects
- Prevents class conflicts (e.g., `p-2 p-4` becomes `p-4`)
- Handles conditional classes elegantly
- Commonly aliased as `cn` for brevity

### Usage Examples
```typescript
// Simple merge
cn('px-2', 'py-1') // 'px-2 py-1'

// Conflict resolution
cn('p-2', 'p-4') // 'p-4' (later wins)

// Conditional
cn('base-class', { 'active': isActive }) // 'base-class active' or 'base-class'

// Arrays
cn(['class1', 'class2'], 'class3') // 'class1 class2 class3'

// Complex
cn('px-2', condition && 'py-4', { 'hover:bg-blue': isHovered })
```

### Why It's Needed
- Tailwind classes can conflict (padding, margin, colors)
- Component props may override default classes
- Conditional styling needs clean syntax
- Array spreading creates duplicate classes

### Known Issues
- None - this is a stable utility pattern

## Future Changes

### Planned
- None needed

### Needed
- None - utility is feature complete

## Change History
- Initial creation following Tailwind best practices

## Watch Out For
- Import path must match actual location
- Requires both clsx and tailwind-merge packages
- Only works with Tailwind utility classes (not custom CSS classes)
- Order matters: later classes override earlier ones
- Don't use for non-Tailwind classes (just use clsx)
- TypeScript type comes from clsx package
- Function must be exported for use in components
