import { RotaryCycleEngine } from '../measurement/RotaryCycleEngine.mjs'
import { sleep } from '../utils/sleep.mjs'
import {
    createWorkerError,
    createWorkerResponse,
    MEASUREMENT_INBOUND,
    MEASUREMENT_OUTBOUND
} from './WorkerProtocol.mjs'

/**
 * Poll interval for modem-signal sampling.
 * @type {number}
 */
const POLL_INTERVAL_MS = 1

/**
 * Maximum frequency of status signal events sent to the UI.
 * @type {number}
 */
const SIGNAL_PUSH_INTERVAL_MS = 33

/**
 * Active serial port in the worker.
 * @type {SerialPort|null}
 */
let activePort = null

/**
 * Indicates whether the measurement loop is running.
 * @type {boolean}
 */
let running = false

/**
 * Tracks whether the worker was disposed.
 * @type {boolean}
 */
let disposed = false

/**
 * Promise of the current polling loop.
 * @type {Promise<void>|null}
 */
let loopPromise = null

/**
 * Timestamp of the last emitted signal snapshot.
 * @type {number}
 */
let lastSignalPushMs = 0

/**
 * Cycle engine shared by the worker loop.
 * @type {RotaryCycleEngine}
 */
const engine = new RotaryCycleEngine({ nowMs: () => performance.now() })

self.addEventListener('message', (event) => {
    void handleWorkerMessage(event)
})

/**
 * Handles one worker message envelope.
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
        emitMeasurementEvent(MEASUREMENT_OUTBOUND.ERROR, {
            code: typeof error?.code === 'string' ? error.code : 'WORKER_ERROR',
            message: error instanceof Error ? error.message : String(error || 'Worker error')
        })

        if (Number.isFinite(requestId)) {
            self.postMessage(createWorkerError(requestId, error))
        }
    }
}

/**
 * Routes one command to its implementation.
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @returns {Promise<Record<string, unknown>>}
 */
async function dispatchRequest(type, payload) {
    if (disposed) {
        throw new Error('Measurement worker is disposed.')
    }

    if (type === MEASUREMENT_INBOUND.CONNECT_PORT) {
        return await connectPort(payload)
    }

    if (type === MEASUREMENT_INBOUND.START) {
        return await startLoop()
    }

    if (type === MEASUREMENT_INBOUND.SET_DEBOUNCE) {
        const debounceMs = Number(payload.debounceMs)
        engine.setDebounceMs(debounceMs)
        return { debounceMs: engine.debounceMs }
    }

    if (type === MEASUREMENT_INBOUND.STOP) {
        stopLoop()
        return { running }
    }

    if (type === MEASUREMENT_INBOUND.DISCONNECT) {
        await disconnectPort()
        return { connected: false, running }
    }

    if (type === MEASUREMENT_INBOUND.SET_LOCALE) {
        // Locale is translated on the main thread for warnings and UI strings.
        return {}
    }

    if (type === MEASUREMENT_INBOUND.DISPOSE) {
        await disposeWorker()
        return { disposed: true }
    }

    throw new Error(`Unsupported measurement worker message: ${type}`)
}

/**
 * Opens a transferred serial port and auto-starts measurement.
 * @param {Record<string, unknown>} payload
 * @returns {Promise<Record<string, unknown>>}
 */
async function connectPort(payload) {
    const transferredPort = payload.port
    if (!transferredPort) {
        throw new Error('No serial port was provided to the measurement worker.')
    }

    if (activePort) {
        await disconnectPort()
    }

    activePort = transferredPort

    await activePort.open({
        baudRate: 300,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
    })

    await activePort.setSignals({ requestToSend: true })

    emitMeasurementEvent(MEASUREMENT_OUTBOUND.CONNECTED, {
        connected: true,
        info: readPortInfo(activePort)
    })

    const result = await startLoop()
    return {
        ...result,
        connected: true,
        info: readPortInfo(activePort)
    }
}

/**
 * Starts the worker polling loop after initializing line state.
 * @returns {Promise<Record<string, unknown>>}
 */
async function startLoop() {
    if (!activePort) {
        throw new Error('Port is not connected.')
    }
    if (running) {
        return { running: true }
    }

    engine.resetAll()

    const initialSignals = await activePort.getSignals()
    const initResult = engine.initializeFromSignals(initialSignals)
    if (initResult.warningKey) {
        emitMeasurementEvent(MEASUREMENT_OUTBOUND.WARNING, {
            key: initResult.warningKey
        })
    }

    running = true
    emitMeasurementEvent(MEASUREMENT_OUTBOUND.RUNNING, { running })

    if (!loopPromise) {
        loopPromise = runPollingLoop().finally(() => {
            loopPromise = null
        })
    }

    return { running }
}

/**
 * Stops the polling loop.
 * @returns {void}
 */
function stopLoop() {
    if (!running) return
    running = false
    emitMeasurementEvent(MEASUREMENT_OUTBOUND.RUNNING, { running })
}

/**
 * Continuously polls modem signals while measurement is active.
 * @returns {Promise<void>}
 */
async function runPollingLoop() {
    while (running && activePort) {
        try {
            const signals = await activePort.getSignals()
            maybeEmitSignals(signals)

            let stableDcd = !!signals.dataCarrierDetect
            if (engine.debounceMs > 0) {
                await sleep(engine.debounceMs)
                const confirm = await activePort.getSignals()
                const confirmDcd = !!confirm.dataCarrierDetect
                if (stableDcd !== confirmDcd) {
                    await sleep(POLL_INTERVAL_MS)
                    continue
                }
                stableDcd = confirmDcd
            }

            const { cycle } = engine.processStableSignals({
                dataCarrierDetect: stableDcd,
                dataSetReady: !!signals.dataSetReady,
                ringIndicator: !!signals.ringIndicator
            })

            if (cycle) {
                emitMeasurementEvent(MEASUREMENT_OUTBOUND.CYCLE, {
                    cycle: serializeCycle(cycle)
                })
            }

            await sleep(POLL_INTERVAL_MS)
        } catch (error) {
            running = false
            emitMeasurementEvent(MEASUREMENT_OUTBOUND.RUNNING, { running })
            emitMeasurementEvent(MEASUREMENT_OUTBOUND.ERROR, {
                code: typeof error?.code === 'string' ? error.code : 'WORKER_ERROR',
                message: error instanceof Error ? error.message : String(error || 'Worker loop error')
            })
        }
    }
}

/**
 * Emits signal updates at a throttled frame-friendly rate.
 * @param {object} signals
 * @returns {void}
 */
function maybeEmitSignals(signals) {
    const nowMs = performance.now()
    if (nowMs - lastSignalPushMs < SIGNAL_PUSH_INTERVAL_MS) return

    lastSignalPushMs = nowMs
    emitMeasurementEvent(MEASUREMENT_OUTBOUND.SIGNALS, {
        signals: {
            dataCarrierDetect: !!signals.dataCarrierDetect,
            dataSetReady: !!signals.dataSetReady,
            ringIndicator: !!signals.ringIndicator
        }
    })
}

/**
 * Serializes a cycle for worker->main transfer.
 * @param {object} cycle
 * @returns {object}
 */
function serializeCycle(cycle) {
    return {
        ...cycle,
        createdAt: cycle?.createdAt ? new Date(cycle.createdAt).toISOString() : null,
        warnings: Array.isArray(cycle.warnings) ? [...cycle.warnings] : []
    }
}

/**
 * Reads serial identification data from a port.
 * @param {SerialPort} port
 * @returns {object|null}
 */
function readPortInfo(port) {
    try {
        const info = port.getInfo?.()
        if (!info || typeof info !== 'object') return null
        return {
            usbVendorId: typeof info.usbVendorId === 'number' ? info.usbVendorId : null,
            usbProductId: typeof info.usbProductId === 'number' ? info.usbProductId : null
        }
    } catch {
        return null
    }
}

/**
 * Disconnects and closes the active serial port.
 * @returns {Promise<void>}
 */
async function disconnectPort() {
    stopLoop()

    if (loopPromise) {
        await loopPromise
    }

    const port = activePort
    activePort = null
    engine.resetAll()

    if (!port) {
        emitMeasurementEvent(MEASUREMENT_OUTBOUND.DISCONNECTED, { connected: false })
        return
    }

    try {
        await port.setSignals({ requestToSend: false, dataTerminalReady: false })
    } catch {}

    try {
        await port.close()
    } catch {}

    emitMeasurementEvent(MEASUREMENT_OUTBOUND.DISCONNECTED, { connected: false })
}

/**
 * Disposes the worker by disconnecting resources and closing the global scope.
 * @returns {Promise<void>}
 */
async function disposeWorker() {
    disposed = true
    await disconnectPort()
    self.close()
}

/**
 * Emits a measurement event to the main thread.
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @returns {void}
 */
function emitMeasurementEvent(type, payload) {
    self.postMessage({ type, payload })
}
