# main.tsx

## Purpose
Application entry point. Sets up React root, error boundary, and global styles. Initializes the Spark framework and renders the main App component.

## Dependencies
### Imports
- `react-dom/client` - React 18 rendering
- `react-error-boundary` - Error boundary wrapper
- `@github/spark/spark` - Spark framework initialization
- `./App.tsx` - Main application component
- `./ErrorFallback.tsx` - Error UI component
- `./components/ui/sonner` - Toast notification system
- Style sheets: `main.css`, `theme.css`, `index.css`

### Used By
- None - this is the entry point

## Key Components

### createRoot(element).render()
- **Purpose:** Initialize React 18 root and render app
- **Parameters:** Root DOM element (#root)
- **Notes:** Uses React 18 concurrent rendering

### ErrorBoundary
- **Purpose:** Catch and handle React errors gracefully
- **Props:** FallbackComponent={ErrorFallback}
- **Notes:** Prevents entire app crash from component errors

### Component Tree
```
<ErrorBoundary>
  <App />
  <Toaster />
</ErrorBoundary>
```

## Terminology
- **Root Element**: DOM node where React app mounts
- **Error Boundary**: React component that catches child errors
- **Toaster**: Global toast notification system
- **Spark**: GitHub's framework for web applications

## Implementation Notes

### Critical Details
- Uses React 18 createRoot API (not legacy ReactDOM.render)
- Error boundary catches errors at top level
- Toaster rendered globally (outside App for positioning)
- Spark framework imported for side effects
- CSS files imported in specific order for proper cascade
- Root element must exist in HTML (#root)

### Style Loading Order
1. `main.css` - Global styles
2. `theme.css` - Theme variables
3. `index.css` - Tailwind directives

### Error Handling
- ErrorBoundary catches React component errors
- ErrorFallback shows user-friendly error UI
- In development, errors re-thrown for better debugging

### Known Issues
- None currently identified

## Future Changes

### Planned
- None scheduled

### Needed
- Service worker for offline support
- Performance monitoring
- Analytics integration
- Progressive Web App manifest
- Loading screen for initial render

## Change History
- Initial creation with React 18
- Added error boundary
- Added Spark framework integration
- Added toast notifications
- Re-created file during persistence hook refactor (no behavior change)

## Watch Out For
- Root element must exist before script runs
- ErrorBoundary must wrap all app content
- CSS import order affects styling
- Spark import required before App can use Spark features
- Toaster must be outside App to appear above all content
- Non-null assertion (!) on getElementById assumes element exists
- Component imports must use correct file extensions (.tsx)
