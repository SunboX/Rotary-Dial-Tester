/**
 * Registers the app service worker when secure-context requirements are met.
 * @returns {Promise<{ registered: boolean, scope?: string }>}
 */
export async function registerServiceWorker() {
    if (!isServiceWorkerSupported()) {
        return { registered: false }
    }

    if (!isSecureRegistrationContext()) {
        return { registered: false }
    }

    try {
        const registration = await navigator.serviceWorker.register('/service-worker.js')
        return {
            registered: true,
            scope: registration.scope
        }
    } catch (error) {
        // Keep registration errors non-fatal and preserve existing app startup behavior.
        console.warn('Service worker registration failed.', error)
        return { registered: false }
    }
}

/**
 * Returns whether the runtime exposes service worker APIs.
 * @returns {boolean}
 */
function isServiceWorkerSupported() {
    return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * Returns whether the current origin satisfies secure-context requirements.
 * @returns {boolean}
 */
function isSecureRegistrationContext() {
    if (typeof window === 'undefined') return false
    if (window.isSecureContext) return true

    const host = String(window.location?.hostname || '')
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
}
