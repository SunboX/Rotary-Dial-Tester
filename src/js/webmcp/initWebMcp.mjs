import { registerDeclarativeTools } from './registerDeclarativeTools.mjs'
import { registerImperativeTools } from './registerImperativeTools.mjs'

/**
 * Initializes WebMCP integration for imperative and declarative tools.
 * @param {{ controller: import('../app/AppController.mjs').AppController, logger?: Pick<Console, 'info'|'warn'|'error'> }} options
 * @returns {{ enabled: boolean, imperativeNames: string[], declarativeNames: string[], cleanup: () => void }}
 */
export function initWebMcp({ controller, logger = console }) {
    if (typeof navigator === 'undefined') {
        return {
            enabled: false,
            imperativeNames: [],
            declarativeNames: [],
            cleanup() {}
        }
    }

    if (!navigator.modelContext) {
        logger.warn('[WebMCP] navigator.modelContext unavailable; skipping tool registration.')
        return {
            enabled: false,
            imperativeNames: [],
            declarativeNames: [],
            cleanup() {}
        }
    }

    let imperativeNames = []
    let declarativeNames = []
    let cleanupDeclarative = () => {}

    try {
        imperativeNames = registerImperativeTools(controller).names
    } catch (err) {
        logger.error('[WebMCP] Failed to register imperative tools.', err)
    }

    try {
        const declarative = registerDeclarativeTools(controller)
        declarativeNames = declarative.names
        cleanupDeclarative = declarative.cleanup
    } catch (err) {
        logger.error('[WebMCP] Failed to register declarative tools.', err)
    }

    const enabled = imperativeNames.length > 0 || declarativeNames.length > 0
    if (enabled) {
        logger.info(
            `[WebMCP] Registered tools: imperative=${imperativeNames.length}, declarative=${declarativeNames.length}.`
        )
    } else {
        logger.warn('[WebMCP] No tools were registered.')
    }

    return {
        enabled,
        imperativeNames,
        declarativeNames,
        cleanup() {
            cleanupDeclarative()
        }
    }
}
