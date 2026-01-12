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
let safetyTimeoutId: number | undefined = undefined;
let hasLoadEventListener = false;
const MINIMUM_DISPLAY_DURATION = 800; // 800ms - enough to see the animation without feeling stuck
const MAXIMUM_LOADING_TIME = 10000; // 10 seconds - force dismissal if React fails to mount
const EXIT_ANIMATION_DURATION = 800; // Match the CSS transition duration for exit animation
const LOAD_EVENT_NAME = 'load';
const OVERLAY_CLASS_VISIBLE = 'visible';
const OVERLAY_CLASS_EXITING = 'exiting';

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
    if (!overlay.classList.contains(OVERLAY_CLASS_VISIBLE)) {
        requestAnimationFrame(() => {
            overlay.classList.add(OVERLAY_CLASS_VISIBLE);
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

    // Clear the safety timeout if it exists, since we're dismissing normally
    if (safetyTimeoutId !== undefined) {
        clearTimeout(safetyTimeoutId);
        safetyTimeoutId = undefined;
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
        overlay.classList.add(OVERLAY_CLASS_EXITING);
        overlay.classList.remove(OVERLAY_CLASS_VISIBLE);

        // Remove overlay from DOM after animations complete
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, EXIT_ANIMATION_DURATION);
    }, remainingTime);
}

/**
 * Reset the loading screen state (useful for testing)
 */
export function resetLoadingScreen(): void {
    overlayVisibleTime = Date.now();
    isInitialized = false;
}

/**
 * Set up a safety timeout to ensure the overlay is dismissed even if React fails to mount.
 * This prevents the loading screen from being stuck indefinitely.
 * The timeout ID is stored internally and cleaned up automatically.
 */
export function setupSafetyTimeout(): void {
    safetyTimeoutId = window.setTimeout(() => {
        const overlay = document.getElementById('startup-overlay');
        // Only dismiss if the overlay still exists and hasn't been removed yet
        if (overlay && overlay.parentNode && !overlay.classList.contains(OVERLAY_CLASS_EXITING)) {
            console.warn('Loading screen safety timeout triggered - forcing dismissal');
            dismissStartupOverlay();
        }
    }, MAXIMUM_LOADING_TIME);
}

/**
 * Dismiss the loading overlay once the window load event fires.
 * This covers cases where React fails to mount but the page finishes loading.
 */
export function setupLoadEventDismissal(): void {
    if (hasLoadEventListener) {
        return;
    }

    // Mark as configured so HMR or duplicate calls do not register multiple listeners.
    hasLoadEventListener = true;

    // If the load event already fired, dismiss immediately.
    if (document.readyState === 'complete') {
        dismissStartupOverlay();
        return;
    }

    // Dismiss once the browser signals that the page finished loading.
    window.addEventListener(LOAD_EVENT_NAME, () => {
        dismissStartupOverlay();
    }, { once: true });
}
