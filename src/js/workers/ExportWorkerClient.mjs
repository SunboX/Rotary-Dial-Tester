import { createWorkerRequest, DEFAULT_REQUEST_TIMEOUT_MS, EXPORT_INBOUND, EXPORT_OUTBOUND } from './WorkerProtocol.mjs'

/**
 * Client wrapper for ExportWorker.mjs with request correlation and timeout handling.
 */
export class ExportWorkerClient {
    /** @type {Worker|null} */
    #worker = null

    /** @type {number} */
    #nextRequestId = 1

    /** @type {Map<number, { resolve: Function, reject: Function, timeoutId: ReturnType<typeof setTimeout> }>} */
    #pending = new Map()

    /** @type {number} */
    #requestTimeoutMs

    /** @type {(payload: object) => void} */
    #onExportReady

    /** @type {(payload: object) => void} */
    #onError

    /** @type {(input: URL, options: WorkerOptions) => Worker} */
    #workerFactory

    /**
     * @param {object} [options]
     * @param {number} [options.requestTimeoutMs]
     * @param {(payload: object) => void} [options.onExportReady]
     * @param {(payload: object) => void} [options.onError]
     * @param {(input: URL, options: WorkerOptions) => Worker} [options.workerFactory]
     */
    constructor(options = {}) {
        this.#requestTimeoutMs = Math.max(100, Number(options.requestTimeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS)
        this.#onExportReady = typeof options.onExportReady === 'function' ? options.onExportReady : () => {}
        this.#onError = typeof options.onError === 'function' ? options.onError : () => {}
        this.#workerFactory =
            typeof options.workerFactory === 'function'
                ? options.workerFactory
                : (input, workerOptions) => new Worker(input, workerOptions)
    }

    /**
     * Returns whether worker export fallback is supported by the runtime.
     * @returns {boolean}
     */
    static isSupported() {
        return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function'
    }

    /**
     * Composes a strip export blob from visible canvases.
     * @param {Array<HTMLCanvasElement>} canvases
     * @param {'png'|'jpg'} [format='png']
     * @returns {Promise<{ blob: Blob, mimeType: string, diagramCount: number }>}
     */
    async exportStripFromCanvases(canvases, format = 'png') {
        this.#ensureWorker()

        const normalizedCanvases = Array.isArray(canvases) ? canvases.filter(Boolean) : []
        if (!normalizedCanvases.length) {
            throw new Error('No canvases available for export.')
        }

        const imageBitmaps = await Promise.all(normalizedCanvases.map((canvas) => createImageBitmap(canvas)))

        try {
            return await this.#request(
                EXPORT_INBOUND.COMPOSE_STRIP_FROM_BITMAPS,
                {
                    bitmaps: imageBitmaps,
                    width: normalizedCanvases[0].width,
                    height: normalizedCanvases[0].height,
                    format
                },
                imageBitmaps
            )
        } finally {
            this.#closeBitmaps(imageBitmaps)
        }
    }

    /**
     * Exports one canvas through the worker and returns an image blob.
     * @param {HTMLCanvasElement} canvas
     * @param {'png'|'jpg'} [format='png']
     * @returns {Promise<{ blob: Blob, mimeType: string }>}
     */
    async exportSingleCanvas(canvas, format = 'png') {
        this.#ensureWorker()

        if (!canvas) {
            throw new Error('Canvas is required for export.')
        }

        const bitmap = await createImageBitmap(canvas)

        try {
            return await this.#request(
                EXPORT_INBOUND.EXPORT_SINGLE_BITMAP,
                {
                    bitmap,
                    width: canvas.width,
                    height: canvas.height,
                    format
                },
                [bitmap]
            )
        } finally {
            this.#closeBitmaps([bitmap])
        }
    }

    /**
     * Disposes the export worker and rejects pending requests.
     * @returns {Promise<void>}
     */
    async dispose() {
        if (!this.#worker) return

        try {
            await this.#request(EXPORT_INBOUND.DISPOSE)
        } catch {
            // Ignore dispose failures because terminate() below is authoritative.
        }

        this.#worker.terminate()
        this.#worker = null
        this.#rejectPending(new Error('Export worker disposed.'))
    }

    /**
     * Initializes the worker lazily.
     * @returns {void}
     */
    #ensureWorker() {
        if (this.#worker) return

        if (!ExportWorkerClient.isSupported()) {
            throw new Error('Export worker is not supported in this browser.')
        }

        const workerUrl = new URL('./ExportWorker.mjs', import.meta.url)
        this.#worker = this.#workerFactory(workerUrl, { type: 'module' })
        this.#worker.addEventListener('message', (event) => {
            this.#handleWorkerMessage(event)
        })
        this.#worker.addEventListener('error', (event) => {
            this.#onError({
                code: 'WORKER_RUNTIME_ERROR',
                message: event?.message || 'Export worker runtime error.'
            })
        })
    }

    /**
     * Sends one request and resolves by matching requestId.
     * @param {string} type
     * @param {Record<string, unknown>} [payload]
     * @param {Transferable[]} [transfer]
     * @returns {Promise<object>}
     */
    #request(type, payload = {}, transfer = []) {
        this.#ensureWorker()

        const requestId = this.#nextRequestId++
        const request = createWorkerRequest(requestId, type, payload)

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.#pending.delete(requestId)
                reject(new Error(`Export worker request timed out: ${type}`))
            }, this.#requestTimeoutMs)

            this.#pending.set(requestId, { resolve, reject, timeoutId })
            this.#worker.postMessage(request, transfer)
        })
    }

    /**
     * Handles worker responses and events.
     * @param {MessageEvent} event
     * @returns {void}
     */
    #handleWorkerMessage(event) {
        const message = event?.data
        if (!message || typeof message !== 'object') return

        if (Number.isFinite(Number(message.requestId))) {
            const requestId = Number(message.requestId)
            const pending = this.#pending.get(requestId)
            if (!pending) return

            clearTimeout(pending.timeoutId)
            this.#pending.delete(requestId)

            if (message.ok === false) {
                pending.reject(this.#toError(message.error))
                return
            }

            pending.resolve(message.payload || {})
            return
        }

        const payload = message.payload || {}

        if (message.type === EXPORT_OUTBOUND.EXPORT_READY) {
            this.#onExportReady(payload)
            return
        }

        if (message.type === EXPORT_OUTBOUND.ERROR) {
            this.#onError(payload)
        }
    }

    /**
     * Closes image bitmaps defensively after transfer.
     * @param {Array<ImageBitmap>} bitmaps
     * @returns {void}
     */
    #closeBitmaps(bitmaps) {
        for (const bitmap of bitmaps) {
            try {
                bitmap.close?.()
            } catch {}
        }
    }

    /**
     * Converts a worker error payload into an Error object.
     * @param {{ code?: string, message?: string }} errorPayload
     * @returns {Error}
     */
    #toError(errorPayload) {
        const err = new Error(errorPayload?.message || 'Export worker request failed.')
        err.code = errorPayload?.code || 'WORKER_ERROR'
        return err
    }

    /**
     * Rejects pending requests when the worker is torn down.
     * @param {Error} error
     * @returns {void}
     */
    #rejectPending(error) {
        for (const [requestId, pending] of this.#pending.entries()) {
            clearTimeout(pending.timeoutId)
            pending.reject(error)
            this.#pending.delete(requestId)
        }
    }
}
