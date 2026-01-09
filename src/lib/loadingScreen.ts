/**
 * Loading Screen Manager
 * Ported from Thero_Idle_TD's startupOverlay.js
 * 
 * Manages the startup loading overlay with minimum display duration
 * and smooth animations.
 */

let overlayVisibleTime: number | null = null;
let isInitialized = false;
const MINIMUM_DISPLAY_DURATION = 3000; // 3 seconds

/**
 * Initialize the startup overlay by making it visible.
 * Records the time when the overlay becomes visible to enforce
 * minimum display duration.
 */
export function initializeStartupOverlay(): void {
    if (isInitialized) {
        return;
    }

    const overlay = document.getElementById('startup-overlay');
    if (!overlay) {
        console.warn('Startup overlay element not found');
        return;
    }

    // Record the time as visible (either already visible from HTML or we're making it visible)
    overlayVisibleTime = Date.now();
    isInitialized = true;
    
    // Ensure the visible class is present (may already be from HTML)
    if (!overlay.classList.contains('visible')) {
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
    }
}

/**
 * Dismiss the startup overlay with smooth animations.
 * Ensures the overlay has been visible for at least the minimum duration
 * before removing it from the DOM.
 */
export function dismissStartupOverlay(): void {
    const overlay = document.getElementById('startup-overlay');
    if (!overlay) {
        return;
    }

    // If not initialized yet (JS loaded very quickly), initialize now
    if (!isInitialized) {
        overlayVisibleTime = Date.now();
        isInitialized = true;
    }

    const timeVisible = overlayVisibleTime ? Date.now() - overlayVisibleTime : 0;
    const remainingTime = Math.max(0, MINIMUM_DISPLAY_DURATION - timeVisible);

    // Wait for minimum duration if needed
    setTimeout(() => {
        // Start exit animations
        overlay.classList.add('exiting');
        overlay.classList.remove('visible');

        // Remove overlay from DOM after animations complete
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 800); // Match the CSS transition duration
    }, remainingTime);
}

/**
 * Reset the loading screen state (useful for testing)
 */
export function resetLoadingScreen(): void {
    overlayVisibleTime = null;
    isInitialized = false;
}
