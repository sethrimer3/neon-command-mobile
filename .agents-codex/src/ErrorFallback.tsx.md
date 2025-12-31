# ErrorFallback.tsx

## Purpose
Error fallback UI component displayed when React error boundary catches an unhandled error. Provides user-friendly error display and recovery option.

## Dependencies
### Imports
- `./components/ui/alert` - Alert UI components
- `./components/ui/button` - Button component
- `lucide-react` - Icon components

### Used By
- `main.tsx` - Used as ErrorBoundary fallback component

## Key Components

### ErrorFallback Component
- **Props:**
  - `error`: Error object with message
  - `resetErrorBoundary`: Function to attempt recovery
- **Returns:** Error display UI

### Error Display
- Alert with destructive variant
- Error message in formatted code block
- "Try Again" button to reset error boundary

### Development Mode Behavior
- **Purpose:** Re-throw errors in dev mode
- **Notes:** Allows React dev tools to show better error info
- **Condition:** `import.meta.env.DEV`

## Terminology
- **Error Boundary**: React pattern for error handling
- **Fallback Component**: UI shown when error caught
- **Reset Error Boundary**: Attempt to recover from error
- **Destructive Variant**: Red/danger styling

## Implementation Notes

### Critical Details
- Only shown in production (re-throws in dev)
- Centered layout with max-width constraint
- Error message displayed in pre-formatted block
- Alert uses destructive styling for urgency
- Reset button attempts to recover app state

### Error Information
- Shows error message only (not stack trace)
- Message limited height with scroll
- Formatted as code for readability

### User Experience
- Clear error indication (red alert)
- Explanation of what happened
- Action button to attempt recovery
- Instructions to contact developer

### Known Issues
- No automatic error reporting
- Stack trace not shown to user
- May not fully recover from all errors

## Future Changes

### Planned
- None scheduled

### Needed
- Automatic error reporting to developer
- More detailed error info in dev mode
- Better recovery strategies
- Error categorization (recoverable vs fatal)
- User error reporting form
- Session replay on error
- Contact developer link
- Show stack trace in expandable section

## Change History
- Initial creation with basic error display
- Added development mode re-throw
- Styled with shadcn/ui components

## Watch Out For
- Must re-throw in dev mode for best debugging
- resetErrorBoundary may not always work
- Error message may contain sensitive info (sanitize if needed)
- Component must handle error prop being any type
- max-h-32 limits error message height
- Props not typed (TypeScript any)
- import.meta.env.DEV is Vite-specific
