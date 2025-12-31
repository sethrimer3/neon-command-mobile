# use-mobile.ts

## Purpose
React hook to detect mobile device based on screen width. Uses media query to determine if viewport is below mobile breakpoint.

## Dependencies
### Imports
- `react` - useState, useEffect hooks

### Used By
- UI components that need responsive behavior
- Components with mobile-specific layouts

## Key Components

### MOBILE_BREAKPOINT
- **Value:** `768` pixels
- **Purpose:** Width threshold for mobile devices
- **Notes:** Standard breakpoint matching Tailwind's `md` breakpoint

### useIsMobile(): boolean
- **Purpose:** Hook that returns mobile status
- **Returns:** `true` if viewport width < 768px, `false` otherwise
- **Notes:**
  - Initially `undefined`, then updates to actual value
  - Updates automatically on window resize
  - Uses matchMedia for efficient detection

## Terminology
- **Media Query**: CSS feature for responsive design
- **Breakpoint**: Width threshold for layout changes
- **Match Media**: Browser API for media query detection

## Implementation Notes

### Critical Details
- Uses window.matchMedia for performance
- Listens to resize events via media query change
- Initial value undefined until first check
- Returns boolean (converts undefined to false with !!)
- Cleanup removes event listener on unmount

### Responsive Behavior
- Mobile: < 768px
- Desktop: >= 768px
- Matches Tailwind's `md:` breakpoint

### Known Issues
- Initial render shows false (not undefined) due to !!
- May cause layout shift on first render

## Future Changes

### Planned
- None scheduled

### Needed
- Support for multiple breakpoints
- Device type detection (tablet vs phone)
- Orientation detection
- Touch capability detection

## Change History
- Initial creation for responsive UI

## Watch Out For
- Initial value is undefined until useEffect runs
- !! converts undefined to false (may hide undefined state)
- Media query string must match breakpoint value
- Event listener must be cleaned up
- Window object not available in SSR
- Breakpoint should match CSS/Tailwind values
