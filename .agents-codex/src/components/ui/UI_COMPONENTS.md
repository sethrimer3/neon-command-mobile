# UI Components (shadcn/ui)

This directory contains 46 UI component files from shadcn/ui library. These are pre-built, accessible, and customizable components based on Radix UI primitives.

## Purpose
Provides a comprehensive set of reusable UI components with:
- Accessibility built-in (ARIA attributes, keyboard navigation)
- Consistent styling via Tailwind CSS
- Type-safe React components
- Customizable variants

## Components List

### Layout & Structure
- **card.tsx** - Container with header, content, footer sections
- **separator.tsx** - Visual divider line
- **scroll-area.tsx** - Scrollable container with custom scrollbar
- **resizable.tsx** - Adjustable split panes
- **aspect-ratio.tsx** - Maintain aspect ratio wrapper
- **sheet.tsx** - Side panel overlay
- **drawer.tsx** - Bottom-up slide panel
- **sidebar.tsx** - Application sidebar navigation

### Navigation
- **navigation-menu.tsx** - Dropdown navigation menu
- **menubar.tsx** - Horizontal menu bar
- **breadcrumb.tsx** - Breadcrumb navigation trail
- **pagination.tsx** - Page number controls
- **tabs.tsx** - Tab switching interface

### Buttons & Actions
- **button.tsx** - Clickable button with variants
- **toggle.tsx** - On/off switch button
- **toggle-group.tsx** - Group of toggle buttons

### Forms & Inputs
- **input.tsx** - Text input field
- **textarea.tsx** - Multi-line text input
- **select.tsx** - Dropdown selection
- **checkbox.tsx** - Checkable box
- **radio-group.tsx** - Radio button group
- **switch.tsx** - Toggle switch control
- **slider.tsx** - Range slider
- **label.tsx** - Form field label
- **form.tsx** - Form wrapper with validation
- **input-otp.tsx** - One-time password input

### Overlays & Dialogs
- **dialog.tsx** - Modal dialog
- **alert-dialog.tsx** - Confirmation dialog
- **popover.tsx** - Floating popup
- **tooltip.tsx** - Hover information
- **hover-card.tsx** - Rich hover content
- **context-menu.tsx** - Right-click menu
- **dropdown-menu.tsx** - Dropdown action menu
- **command.tsx** - Command palette (Cmd+K style)

### Feedback & Display
- **alert.tsx** - Alert message banner
- **badge.tsx** - Small status badge
- **progress.tsx** - Progress bar
- **skeleton.tsx** - Loading placeholder
- **sonner.tsx** - Toast notifications
- **avatar.tsx** - User avatar image

### Data Display
- **table.tsx** - Data table
- **calendar.tsx** - Date picker calendar
- **chart.tsx** - Data visualization
- **carousel.tsx** - Image/content slider
- **collapsible.tsx** - Expandable content

## Dependencies
All components typically import:
- `react` - Core React
- `@radix-ui/*` - Primitive components
- `class-variance-authority` - Variant styling
- `../../lib/utils` (cn function) - Class name merging

## Usage Pattern
```typescript
import { Button } from "@/components/ui/button"

<Button variant="outline" size="lg">
  Click me
</Button>
```

## Terminology
- **Radix UI**: Unstyled, accessible component library
- **Variant**: Style variation (e.g., primary, outline, ghost)
- **Primitive**: Low-level building block component
- **Compound Component**: Multiple related components (e.g., Card + CardHeader + CardContent)

## Implementation Notes

### Common Patterns
- All use `cn()` for class name merging
- Most have variant prop for styling
- Forward refs for DOM access
- TypeScript interfaces for props
- Compound components for complex UI

### Styling
- Tailwind CSS for all styles
- CSS variables for theming
- Dark mode support built-in
- Responsive design utilities

### Accessibility
- ARIA attributes included
- Keyboard navigation
- Focus management
- Screen reader support

### Customization
- Edit files directly to customize
- Variants defined with CVA
- Tailwind classes can be overridden
- Component logic can be extended

## Watch Out For
- Import paths must match project structure
- cn() function required from utils
- Radix UI peer dependencies needed
- Some components require state management
- Compound components must be used together
- Variants are specific to each component
- CSS variables must be defined in theme
- Dark mode requires class-based approach
- TypeScript types must match Radix UI
- Some components need portal for positioning

## Maintenance Notes
- These are copies, not npm packages
- Updates require manual copying from shadcn/ui
- Customizations persist across updates
- Test thoroughly after any changes
- Keep Radix UI versions compatible

## Future Considerations
- May need additional components
- Consider custom variants for game theme
- Animation customization for game feel
- Performance optimization for large lists
- Theming for different player colors
