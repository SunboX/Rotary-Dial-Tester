import { createWorkerError, createWorkerResponse, EXPORT_INBOUND, EXPORT_OUTBOUND } from './WorkerProtocol.mjs'

/**
 * Tracks whether the worker has been disposed.
 * @type {boolean}
 */
let disposed = false

self.addEventListener('message', (event) => {
    void handleWorkerMessage(event)
})

/**
 * Handles one export worker message.
 * @param {MessageEvent} event
 * @returns {Promise<void>}
 */
async function handleWorkerMessage(event) {
    const message = event?.data
    if (!message || typeof message.type !== 'string') return

    const requestId = Number(message.requestId)
    const payload = message.payload || {}

    try {
        const result = await dispatchRequest(message.type, payload)
        if (Number.isFinite(requestId)) {
            self.postMessage(createWorkerResponse(requestId, result || {}))
        }
    } catch (error) {
        emitExportEvent(EXPORT_OUTBOUND.ERROR, {
            code: typeof error?.code === 'string' ? error.code : 'WORKER_ERROR',
            message: error instanceof Error ? error.message : String(error || 'Export worker error')
        })

        if (Number.isFinite(requestId)) {
            self.postMessage(createWorkerError(requestId, error))
        }
    }
}

/**
 * Dispatches one worker command.
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @returns {Promise<Record<string, unknown>>}
 */
async function dispatchRequest(type, payload) {
    if (disposed && type !== EXPORT_INBOUND.DISPOSE) {
        throw new Error('Export worker is disposed.')
    }

    if (type === EXPORT_INBOUND.COMPOSE_STRIP_FROM_BITMAPS) {
        const result = await composeStripFromBitmaps(payload)
        emitExportEvent(EXPORT_OUTBOUND.EXPORT_READY, {
            kind: 'strip',
            mimeType: result.mimeType,
            diagramCount: result.diagramCount
        })
        return result
    }

    if (type === EXPORT_INBOUND.EXPORT_SINGLE_BITMAP) {
        const result = await exportSingleBitmap(payload)
        emitExportEvent(EXPORT_OUTBOUND.EXPORT_READY, {
            kind: 'single',
            mimeType: result.mimeType
        })
        return result
    }

    if (type === EXPORT_INBOUND.DISPOSE) {
        disposed = true
        self.close()
        return { disposed: true }
    }

    throw new Error(`Unsupported export worker message: ${type}`)
}

/**
 * Composes a strip image from transferred ImageBitmap frames.
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ blob: Blob, mimeType: string, diagramCount: number }>}
 */
async function composeStripFromBitmaps(payload) {
    const bitmaps = normalizeBitmapList(payload.bitmaps)
    if (!bitmaps.length) {
        throw new Error('No bitmaps provided for strip export.')
    }

    const margin = Math.max(0, Number(payload.margin) || 20)
    const background = String(payload.background || 'white')
    const width = Math.max(1, Number(payload.width) || bitmaps[0].width || 1)
    const height = Math.max(1, Number(payload.height) || bitmaps[0].height || 1)
    const outWidth = width + margin * 2
    const outHeight = bitmaps.length * (height + margin) + margin

    const outCanvas = new OffscreenCanvas(outWidth, outHeight)
    const ctx = outCanvas.getContext('2d')
    if (!ctx) {
        throw new Error('2D canvas context is not available in export worker.')
    }

    try {
        ctx.fillStyle = background
        ctx.fillRect(0, 0, outWidth, outHeight)

        let y = margin
        for (const bitmap of bitmaps) {
            ctx.drawImage(bitmap, margin, y, width, height)
            y += height + margin
        }

        const { mimeType, quality } = resolveExportFormat(payload.format)
        const blob = await outCanvas.convertToBlob({ type: mimeType, quality })
        return {
            blob,
            mimeType,
            diagramCount: bitmaps.length
        }
    } finally {
        closeBitmaps(bitmaps)
    }
}

/**
 * Exports one transferred ImageBitmap.
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ blob: Blob, mimeType: string }>}
 */
async function exportSingleBitmap(payload) {
    const bitmaps = normalizeBitmapList(payload.bitmap ? [payload.bitmap] : payload.bitmaps)
    if (!bitmaps.length) {
        throw new Error('No bitmap provided for single export.')
    }

    const bitmap = bitmaps[0]
    const width = Math.max(1, Number(payload.width) || bitmap.width || 1)
    const height = Math.max(1, Number(payload.height) || bitmap.height || 1)
    const outCanvas = new OffscreenCanvas(width, height)
    const ctx = outCanvas.getContext('2d')
    if (!ctx) {
        throw new Error('2D canvas context is not available in export worker.')
    }

    try {
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(bitmap, 0, 0, width, height)

        const { mimeType, quality } = resolveExportFormat(payload.format)
        const blob = await outCanvas.convertToBlob({ type: mimeType, quality })
        return {
            blob,
            mimeType
        }
    } finally {
        closeBitmaps(bitmaps)
    }
}

/**
 * Resolves payload bitmaps into a validated array.
 * @param {unknown} bitmaps
 * @returns {Array<ImageBitmap>}
 */
function normalizeBitmapList(bitmaps) {
    if (!Array.isArray(bitmaps)) return []
    return bitmaps.filter((bitmap) => !!bitmap)
}

/**
 * Resolves MIME type and quality from requested export format.
 * @param {unknown} format
 * @returns {{ mimeType: string, quality: number|undefined }}
 */
function resolveExportFormat(format) {
    const normalized = String(format || 'png')
    if (normalized === 'jpg' || normalized === 'jpeg') {
        return { mimeType: 'image/jpeg', quality: 0.92 }
    }

    return { mimeType: 'image/png', quality: undefined }
}

/**
 * Closes transferred bitmaps when possible to release worker memory.
 * @param {Array<ImageBitmap>} bitmaps
 * @returns {void}
 */
function closeBitmaps(bitmaps) {
    for (const bitmap of bitmaps) {
        try {
            bitmap.close?.()
        } catch {}
    }
}

/**
 * Emits one export worker event.
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @returns {void}
 */
function emitExportEvent(type, payload) {
    self.postMessage({ type, payload })
}
