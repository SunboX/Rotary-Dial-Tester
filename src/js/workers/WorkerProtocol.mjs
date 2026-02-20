/**
 * Shared request timeout used by worker clients.
 * @type {number}
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 5000

/**
 * Measurement worker inbound command names.
 * @type {{ CONNECT_PORT: string, START: string, SET_DEBOUNCE: string, STOP: string, DISCONNECT: string, SET_LOCALE: string, DISPOSE: string }}
 */
export const MEASUREMENT_INBOUND = Object.freeze({
    CONNECT_PORT: 'connectPort',
    START: 'start',
    SET_DEBOUNCE: 'setDebounce',
    STOP: 'stop',
    DISCONNECT: 'disconnect',
    SET_LOCALE: 'setLocale',
    DISPOSE: 'dispose'
})

/**
 * Measurement worker outbound event names.
 * @type {{ CONNECTED: string, RUNNING: string, SIGNALS: string, CYCLE: string, WARNING: string, ERROR: string, DISCONNECTED: string }}
 */
export const MEASUREMENT_OUTBOUND = Object.freeze({
    CONNECTED: 'connected',
    RUNNING: 'running',
    SIGNALS: 'signals',
    CYCLE: 'cycle',
    WARNING: 'warning',
    ERROR: 'error',
    DISCONNECTED: 'disconnected'
})

/**
 * Render worker inbound command names.
 * @type {{ ATTACH_DIAGRAM_CANVAS: string, DRAW_DIAGRAM: string, DETACH_DIAGRAM_CANVAS: string, ATTACH_ANALYSIS_CANVAS: string, DRAW_RUNTIME: string, GET_SPREAD_ROWS: string, CLEAR_ANALYSIS: string, EXPORT_STRIP: string, EXPORT_DIAGRAM: string, SET_LOCALE: string, DISPOSE: string }}
 */
export const RENDER_INBOUND = Object.freeze({
    ATTACH_DIAGRAM_CANVAS: 'attachDiagramCanvas',
    DRAW_DIAGRAM: 'drawDiagram',
    DETACH_DIAGRAM_CANVAS: 'detachDiagramCanvas',
    ATTACH_ANALYSIS_CANVAS: 'attachAnalysisCanvas',
    DRAW_RUNTIME: 'drawRuntime',
    GET_SPREAD_ROWS: 'getSpreadRows',
    CLEAR_ANALYSIS: 'clearAnalysis',
    EXPORT_STRIP: 'exportStrip',
    EXPORT_DIAGRAM: 'exportDiagram',
    SET_LOCALE: 'setLocale',
    DISPOSE: 'dispose'
})

/**
 * Render worker outbound event names.
 * @type {{ RENDERED: string, EXPORT_READY: string, SPREAD_ROWS: string, ERROR: string }}
 */
export const RENDER_OUTBOUND = Object.freeze({
    RENDERED: 'rendered',
    EXPORT_READY: 'exportReady',
    SPREAD_ROWS: 'spreadRows',
    ERROR: 'error'
})

/**
 * Export worker inbound command names.
 * @type {{ COMPOSE_STRIP_FROM_BITMAPS: string, EXPORT_SINGLE_BITMAP: string, DISPOSE: string }}
 */
export const EXPORT_INBOUND = Object.freeze({
    COMPOSE_STRIP_FROM_BITMAPS: 'composeStripFromBitmaps',
    EXPORT_SINGLE_BITMAP: 'exportSingleBitmap',
    DISPOSE: 'dispose'
})

/**
 * Export worker outbound event names.
 * @type {{ EXPORT_READY: string, ERROR: string }}
 */
export const EXPORT_OUTBOUND = Object.freeze({
    EXPORT_READY: 'exportReady',
    ERROR: 'error'
})

/**
 * Creates a request envelope sent to a worker.
 * @param {number} requestId
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 * @returns {{ requestId: number, type: string, payload: Record<string, unknown> }}
 */
export function createWorkerRequest(requestId, type, payload = {}) {
    return { requestId, type, payload }
}

/**
 * Creates a successful response envelope sent from a worker.
 * @param {number} requestId
 * @param {Record<string, unknown>} [payload]
 * @returns {{ requestId: number, ok: true, payload: Record<string, unknown> }}
 */
export function createWorkerResponse(requestId, payload = {}) {
    return {
        requestId,
        ok: true,
        payload
    }
}

/**
 * Creates an error response envelope sent from a worker.
 * @param {number} requestId
 * @param {unknown} error
 * @returns {{ requestId: number, ok: false, error: { code: string, message: string } }}
 */
export function createWorkerError(requestId, error) {
    return {
        requestId,
        ok: false,
        error: {
            code: typeof error?.code === 'string' && error.code ? error.code : 'WORKER_ERROR',
            message: error instanceof Error ? error.message : String(error || 'Worker error')
        }
    }
}
