import { createWorkerRequest, DEFAULT_REQUEST_TIMEOUT_MS, RENDER_INBOUND, RENDER_OUTBOUND } from './WorkerProtocol.mjs'

/**
 * Client wrapper around RenderWorker.mjs with request tracking and timeout handling.
 */
export class RenderWorkerClient {
    /** @type {Worker|null} */
    #worker = null

    /** @type {number} */
    #nextRequestId = 1

    /** @type {Map<number, { resolve: Function, reject: Function, timeoutId: ReturnType<typeof setTimeout> }>} */
    #pending = new Map()

    /** @type {number} */
    #requestTimeoutMs

    /** @type {(input: URL, options: WorkerOptions) => Worker} */
    #workerFactory

    /** @type {(payload: object) => void} */
    #onRendered

    /** @type {(payload: object) => void} */
    #onExportReady

    /** @type {(payload: object) => void} */
    #onSpreadRows

    /** @type {(payload: object) => void} */
    #onError

    /**
     * @param {object} [options]
     * @param {number} [options.requestTimeoutMs]
     * @param {(payload: object) => void} [options.onRendered]
     * @param {(payload: object) => void} [options.onExportReady]
     * @param {(payload: object) => void} [options.onSpreadRows]
     * @param {(payload: object) => void} [options.onError]
     * @param {(input: URL, options: WorkerOptions) => Worker} [options.workerFactory]
     */
    constructor(options = {}) {
        this.#requestTimeoutMs = Math.max(100, Number(options.requestTimeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS)
        this.#workerFactory =
            typeof options.workerFactory === 'function'
                ? options.workerFactory
                : (input, workerOptions) => new Worker(input, workerOptions)
        this.#onRendered = typeof options.onRendered === 'function' ? options.onRendered : () => {}
        this.#onExportReady = typeof options.onExportReady === 'function' ? options.onExportReady : () => {}
        this.#onSpreadRows = typeof options.onSpreadRows === 'function' ? options.onSpreadRows : () => {}
        this.#onError = typeof options.onError === 'function' ? options.onError : () => {}
    }

    /**
     * Returns whether required worker and OffscreenCanvas APIs are available.
     * @returns {boolean}
     */
    static isSupported() {
        return (
            typeof Worker !== 'undefined' &&
            typeof OffscreenCanvas !== 'undefined' &&
            typeof HTMLCanvasElement !== 'undefined' &&
            typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function'
        )
    }

    /**
     * Attaches the analysis canvas to the render worker.
     * @param {HTMLCanvasElement} canvas
     * @returns {Promise<object>}
     */
    async attachAnalysisCanvas(canvas) {
        const offscreen = this.#transferCanvas(canvas)
        return await this.#request(RENDER_INBOUND.ATTACH_ANALYSIS_CANVAS, { canvas: offscreen }, [offscreen])
    }

    /**
     * Attaches one diagram canvas to the render worker.
     * @param {string} diagramId
     * @param {HTMLCanvasElement} canvas
     * @returns {Promise<object>}
     */
    async attachDiagramCanvas(diagramId, canvas) {
        const normalizedId = String(diagramId)
        const offscreen = this.#transferCanvas(canvas)
        return await this.#request(
            RENDER_INBOUND.ATTACH_DIAGRAM_CANVAS,
            {
                diagramId: normalizedId,
                canvas: offscreen
            },
            [offscreen]
        )
    }

    /**
     * Draws one diagram in the render worker.
     * @param {string} diagramId
     * @param {object} cycle
     * @param {boolean} [ideal=false]
     * @returns {Promise<object>}
     */
    async drawDiagram(diagramId, cycle, ideal = false) {
        return await this.#request(RENDER_INBOUND.DRAW_DIAGRAM, {
            diagramId: String(diagramId),
            cycle,
            ideal: !!ideal
        })
    }

    /**
     * Removes one diagram canvas attachment from the render worker.
     * @param {string} diagramId
     * @returns {Promise<object>}
     */
    async detachDiagramCanvas(diagramId) {
        return await this.#request(RENDER_INBOUND.DETACH_DIAGRAM_CANVAS, {
            diagramId: String(diagramId)
        })
    }

    /**
     * Draws the runtime scatter analysis on the worker-attached analysis canvas.
     * @param {Array<object>} cycles
     * @returns {Promise<object>}
     */
    async drawRuntime(cycles) {
        return await this.#request(RENDER_INBOUND.DRAW_RUNTIME, { cycles })
    }

    /**
     * Computes spread-analysis rows in the render worker.
     * @param {Array<object>} cycles
     * @returns {Promise<{ pulses: number, rows: Array<object> }>}
     */
    async getSpreadRows(cycles) {
        const response = await this.#request(RENDER_INBOUND.GET_SPREAD_ROWS, { cycles })
        return response?.spread || { pulses: 0, rows: [] }
    }

    /**
     * Clears analysis canvas content in the worker.
     * @returns {Promise<object>}
     */
    async clearAnalysis() {
        return await this.#request(RENDER_INBOUND.CLEAR_ANALYSIS)
    }

    /**
     * Exports all diagrams as one image blob.
     * @param {Array<string>} diagramIds
     * @param {'png'|'jpg'} format
     * @returns {Promise<{ blob: Blob, mimeType: string, diagramCount: number }>}
     */
    async exportStrip(diagramIds, format) {
        return await this.#request(RENDER_INBOUND.EXPORT_STRIP, {
            diagramIds,
            format
        })
    }

    /**
     * Exports one diagram as an image blob.
     * @param {string} diagramId
     * @param {'png'|'jpg'} [format='png']
     * @returns {Promise<{ blob: Blob, mimeType: string, diagramId: string }>}
     */
    async exportDiagram(diagramId, format = 'png') {
        return await this.#request(RENDER_INBOUND.EXPORT_DIAGRAM, {
            diagramId: String(diagramId),
            format
        })
    }

    /**
     * Updates active locale in render worker.
     * @param {string} locale
     * @returns {Promise<object>}
     */
    async setLocale(locale) {
        return await this.#request(RENDER_INBOUND.SET_LOCALE, {
            locale: String(locale || 'en')
        })
    }

    /**
     * Disposes worker resources and rejects pending requests.
     * @returns {Promise<void>}
     */
    async dispose() {
        if (!this.#worker) return

        try {
            await this.#request(RENDER_INBOUND.DISPOSE)
        } catch {
            // Ignore dispose failures because terminate() below is authoritative.
        }

        this.#worker.terminate()
        this.#worker = null
        this.#rejectPending(new Error('Render worker disposed.'))
    }

    /**
     * Transfers an HTML canvas to an OffscreenCanvas for worker rendering.
     * @param {HTMLCanvasElement} canvas
     * @returns {OffscreenCanvas}
     */
    #transferCanvas(canvas) {
        if (!canvas || typeof canvas.transferControlToOffscreen !== 'function') {
            throw new Error('Canvas does not support OffscreenCanvas transfer.')
        }
        return canvas.transferControlToOffscreen()
    }

    /**
     * Ensures that the render worker exists before posting messages.
     * @returns {void}
     */
    #ensureWorker() {
        if (this.#worker) return
        if (!RenderWorkerClient.isSupported()) {
            throw new Error('Render worker is not supported in this browser.')
        }

        const workerUrl = new URL('./RenderWorker.mjs', import.meta.url)
        this.#worker = this.#workerFactory(workerUrl, { type: 'module' })
        this.#worker.addEventListener('message', (event) => {
            this.#handleWorkerMessage(event)
        })
        this.#worker.addEventListener('error', (event) => {
            this.#onError({
                code: 'WORKER_RUNTIME_ERROR',
                message: event?.message || 'Render worker runtime error.'
            })
        })
    }

    /**
     * Sends a request and resolves by requestId correlation.
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
                reject(new Error(`Render worker request timed out: ${type}`))
            }, this.#requestTimeoutMs)

            this.#pending.set(requestId, { resolve, reject, timeoutId })
            this.#worker.postMessage(request, transfer)
        })
    }

    /**
     * Handles responses and events from the render worker.
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

        if (message.type === RENDER_OUTBOUND.RENDERED) {
            this.#onRendered(payload)
            return
        }

        if (message.type === RENDER_OUTBOUND.EXPORT_READY) {
            this.#onExportReady(payload)
            return
        }

        if (message.type === RENDER_OUTBOUND.SPREAD_ROWS) {
            this.#onSpreadRows(payload)
            return
        }

        if (message.type === RENDER_OUTBOUND.ERROR) {
            this.#onError(payload)
        }
    }

    /**
     * Converts worker error payloads into Error objects.
     * @param {{ code?: string, message?: string }} errorPayload
     * @returns {Error}
     */
    #toError(errorPayload) {
        const err = new Error(errorPayload?.message || 'Render worker request failed.')
        err.code = errorPayload?.code || 'WORKER_ERROR'
        return err
    }

    /**
     * Rejects pending request promises when worker is torn down.
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
