/**
 * Loading Screen Manager
 * Ported from Thero_Idle_TD's startupOverlay.js
 * 
 * Manages the startup loading overlay with minimum display duration
 * and smooth animations.
 */

// Start the timer from when the module loads (page load time) instead of when functions are called
// This ensures we don't reset the timer if initialization is delayed
let overlayVisibleTime: number = Date.now();
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
        // Still mark as initialized to prevent duplicate initialization attempts
        isInitialized = true;
        return;
    }

    // overlayVisibleTime is already set to module load time, no need to reset it
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

    // Mark as initialized if not already (in case this is called before initializeStartupOverlay)
    if (!isInitialized) {
        isInitialized = true;
    }

    // overlayVisibleTime is set to module load time, so calculate elapsed time from then
    const timeVisible = Date.now() - overlayVisibleTime;
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
    overlayVisibleTime = Date.now();
    isInitialized = false;
}
