import {
    createWorkerRequest,
    DEFAULT_REQUEST_TIMEOUT_MS,
    MEASUREMENT_INBOUND,
    MEASUREMENT_OUTBOUND
} from './WorkerProtocol.mjs'

/**
 * Client wrapper around MeasurementWorker.mjs with request/response correlation.
 */
export class MeasurementWorkerClient {
    /** @type {Worker|null} */
    #worker = null

    /** @type {number} */
    #nextRequestId = 1

    /** @type {Map<number, { resolve: Function, reject: Function, timeoutId: ReturnType<typeof setTimeout> }>} */
    #pending = new Map()

    /** @type {number} */
    #requestTimeoutMs

    /** @type {boolean} */
    #connected = false

    /** @type {boolean} */
    #running = false

    /** @type {object|null} */
    #portInfo = null

    /** @type {(input: URL, options: WorkerOptions) => Worker} */
    #workerFactory

    /** @type {(payload: object) => void} */
    #onSignals

    /** @type {(payload: object) => void} */
    #onCycle

    /** @type {(payload: object) => void} */
    #onWarning

    /** @type {(payload: object) => void} */
    #onRunning

    /** @type {(payload: object) => void} */
    #onConnected

    /** @type {(payload: object) => void} */
    #onDisconnected

    /** @type {(payload: object) => void} */
    #onError

    /**
     * @param {object} [options]
     * @param {number} [options.requestTimeoutMs]
     * @param {(payload: object) => void} [options.onSignals]
     * @param {(payload: object) => void} [options.onCycle]
     * @param {(payload: object) => void} [options.onWarning]
     * @param {(payload: object) => void} [options.onRunning]
     * @param {(payload: object) => void} [options.onConnected]
     * @param {(payload: object) => void} [options.onDisconnected]
     * @param {(payload: object) => void} [options.onError]
     * @param {(input: URL, options: WorkerOptions) => Worker} [options.workerFactory]
     */
    constructor(options = {}) {
        this.#requestTimeoutMs = Math.max(100, Number(options.requestTimeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS)
        this.#workerFactory =
            typeof options.workerFactory === 'function'
                ? options.workerFactory
                : (input, workerOptions) => new Worker(input, workerOptions)
        this.#onSignals = typeof options.onSignals === 'function' ? options.onSignals : () => {}
        this.#onCycle = typeof options.onCycle === 'function' ? options.onCycle : () => {}
        this.#onWarning = typeof options.onWarning === 'function' ? options.onWarning : () => {}
        this.#onRunning = typeof options.onRunning === 'function' ? options.onRunning : () => {}
        this.#onConnected = typeof options.onConnected === 'function' ? options.onConnected : () => {}
        this.#onDisconnected = typeof options.onDisconnected === 'function' ? options.onDisconnected : () => {}
        this.#onError = typeof options.onError === 'function' ? options.onError : () => {}
    }

    /**
     * Indicates whether the current runtime supports dedicated workers.
     * @returns {boolean}
     */
    static isSupported() {
        return typeof Worker !== 'undefined'
    }

    /**
     * Returns connection state reported by worker events.
     * @returns {boolean}
     */
    get connected() {
        return this.#connected
    }

    /**
     * Returns running state reported by worker events.
     * @returns {boolean}
     */
    get running() {
        return this.#running
    }

    /**
     * Returns the last known serial identification payload.
     * @returns {object|null}
     */
    get portInfo() {
        return this.#portInfo
    }

    /**
     * Connects a transferred serial port and auto-starts the measurement loop in the worker.
     * @param {SerialPort} port
     * @returns {Promise<object>}
     */
    async connectPort(port) {
        if (!port) {
            throw new Error('A serial port is required.')
        }

        const response = await this.#request(MEASUREMENT_INBOUND.CONNECT_PORT, { port }, [port])
        this.#connected = true
        this.#running = !!response.running
        this.#portInfo = response.info || null
        return response
    }

    /**
     * Starts measurement in the worker.
     * @returns {Promise<object>}
     */
    async start() {
        const response = await this.#request(MEASUREMENT_INBOUND.START)
        this.#running = !!response.running
        return response
    }

    /**
     * Sets debounce in milliseconds.
     * @param {number} debounceMs
     * @returns {Promise<object>}
     */
    async setDebounce(debounceMs) {
        return await this.#request(MEASUREMENT_INBOUND.SET_DEBOUNCE, {
            debounceMs: Number(debounceMs)
        })
    }

    /**
     * Stops worker-side measurement polling.
     * @returns {Promise<object>}
     */
    async stop() {
        const response = await this.#request(MEASUREMENT_INBOUND.STOP)
        this.#running = !!response.running
        return response
    }

    /**
     * Disconnects the worker-managed serial port.
     * @returns {Promise<object>}
     */
    async disconnect() {
        const response = await this.#request(MEASUREMENT_INBOUND.DISCONNECT)
        this.#connected = false
        this.#running = false
        this.#portInfo = null
        return response
    }

    /**
     * Disposes worker resources and rejects all pending requests.
     * @returns {Promise<void>}
     */
    async dispose() {
        if (!this.#worker) return

        try {
            await this.#request(MEASUREMENT_INBOUND.DISPOSE)
        } catch {
            // Ignore dispose failures because terminate() below is authoritative.
        }

        this.#worker.terminate()
        this.#worker = null
        this.#connected = false
        this.#running = false
        this.#portInfo = null
        this.#rejectPending(new Error('Measurement worker disposed.'))
    }

    /**
     * Lazily ensures worker initialization.
     * @returns {void}
     */
    #ensureWorker() {
        if (this.#worker) return
        if (!MeasurementWorkerClient.isSupported()) {
            throw new Error('Workers are not supported in this browser.')
        }

        const workerUrl = new URL('./MeasurementWorker.mjs', import.meta.url)
        this.#worker = this.#workerFactory(workerUrl, { type: 'module' })
        this.#worker.addEventListener('message', (event) => {
            this.#handleWorkerMessage(event)
        })
        this.#worker.addEventListener('error', (event) => {
            this.#onError({
                code: 'WORKER_RUNTIME_ERROR',
                message: event?.message || 'Measurement worker runtime error.'
            })
        })
    }

    /**
     * Sends one request to the worker and resolves when a response with the same requestId arrives.
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
                reject(new Error(`Measurement worker request timed out: ${type}`))
            }, this.#requestTimeoutMs)

            this.#pending.set(requestId, { resolve, reject, timeoutId })
            this.#worker.postMessage(request, transfer)
        })
    }

    /**
     * Handles responses and event notifications from the worker.
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

        if (message.type === MEASUREMENT_OUTBOUND.CONNECTED) {
            this.#connected = true
            this.#portInfo = payload.info || null
            this.#onConnected(payload)
            return
        }

        if (message.type === MEASUREMENT_OUTBOUND.RUNNING) {
            this.#running = !!payload.running
            this.#onRunning(payload)
            return
        }

        if (message.type === MEASUREMENT_OUTBOUND.SIGNALS) {
            this.#onSignals(payload)
            return
        }

        if (message.type === MEASUREMENT_OUTBOUND.CYCLE) {
            this.#onCycle(payload)
            return
        }

        if (message.type === MEASUREMENT_OUTBOUND.WARNING) {
            this.#onWarning(payload)
            return
        }

        if (message.type === MEASUREMENT_OUTBOUND.DISCONNECTED) {
            this.#connected = false
            this.#running = false
            this.#portInfo = null
            this.#onDisconnected(payload)
            return
        }

        if (message.type === MEASUREMENT_OUTBOUND.ERROR) {
            this.#onError(payload)
        }
    }

    /**
     * Builds an Error from worker error payloads.
     * @param {{ code?: string, message?: string }} errorPayload
     * @returns {Error}
     */
    #toError(errorPayload) {
        const err = new Error(errorPayload?.message || 'Measurement worker request failed.')
        err.code = errorPayload?.code || 'WORKER_ERROR'
        return err
    }

    /**
     * Rejects every pending request with the same error.
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
