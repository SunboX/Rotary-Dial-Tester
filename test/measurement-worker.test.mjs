import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * Creates a minimal WorkerGlobalScope mock for worker module tests.
 * @returns {{ workerSelf: object, sentMessages: Array<object>, emitMessage: (message: object) => void, closedRef: { value: boolean } }}
 */
function createWorkerHarness() {
    const listeners = {
        message: []
    }
    const sentMessages = []
    const closedRef = { value: false }

    const workerSelf = {
        addEventListener(type, listener) {
            if (!listeners[type]) listeners[type] = []
            listeners[type].push(listener)
        },
        postMessage(message) {
            sentMessages.push(message)
        },
        close() {
            closedRef.value = true
        }
    }

    return {
        workerSelf,
        sentMessages,
        closedRef,
        emitMessage(message) {
            for (const listener of listeners.message || []) {
                listener({ data: message })
            }
        }
    }
}

/**
 * Waits until a worker-sent message matches a predicate.
 * @param {Array<object>} sentMessages
 * @param {(message: object) => boolean} predicate
 * @param {number} [timeoutMs=200]
 * @returns {Promise<object>}
 */
async function waitForMessage(sentMessages, predicate, timeoutMs = 200) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
        const match = sentMessages.find(predicate)
        if (match) return match
        await new Promise((resolve) => setTimeout(resolve, 2))
    }

    throw new Error('Timed out waiting for worker message.')
}

/**
 * Loads MeasurementWorker into an isolated mocked self scope.
 * @param {{ workerSelf: object }} harness
 * @returns {Promise<void>}
 */
async function loadWorker(harness) {
    globalThis.self = harness.workerSelf
    await import(`../src/js/workers/MeasurementWorker.mjs?test=${Date.now()}-${Math.random()}`)
}

/**
 * Verifies worker connect opens the port with expected settings and applies RTS.
 * @returns {Promise<void>}
 */
test('measurement worker opens port and toggles modem signals', async () => {
    const previousSelf = globalThis.self
    const harness = createWorkerHarness()
    try {
        await loadWorker(harness)

        const calls = {
            open: [],
            setSignals: [],
            close: 0
        }

        const port = {
            async open(options) {
                calls.open.push(options)
            },
            async setSignals(signals) {
                calls.setSignals.push(signals)
            },
            async close() {
                calls.close += 1
            },
            async getSignals() {
                return {
                    dataCarrierDetect: true,
                    dataSetReady: false,
                    ringIndicator: false
                }
            },
            getInfo() {
                return { usbVendorId: 0x0403, usbProductId: 0x6001 }
            }
        }

        harness.emitMessage({
            requestId: 1,
            type: 'connectPort',
            payload: { port }
        })

        const connectResponse = await waitForMessage(harness.sentMessages, (message) => message.requestId === 1)
        assert.equal(connectResponse.ok, true)
        assert.equal(calls.open.length, 1)
        assert.equal(calls.open[0].baudRate, 300)
        assert.deepEqual(calls.setSignals[0], { requestToSend: true })

        harness.emitMessage({ requestId: 2, type: 'stop', payload: {} })
        await waitForMessage(harness.sentMessages, (message) => message.requestId === 2)

        harness.emitMessage({ requestId: 3, type: 'disconnect', payload: {} })
        await waitForMessage(harness.sentMessages, (message) => message.requestId === 3)

        assert.deepEqual(calls.setSignals.at(-1), { requestToSend: false, dataTerminalReady: false })
        assert.equal(calls.close, 1)
    } finally {
        globalThis.self = previousSelf
    }
})

/**
 * Verifies the polling loop emits cycle payloads once thresholds are met.
 * @returns {Promise<void>}
 */
test('measurement worker emits cycle events from sampled signals', async () => {
    const previousSelf = globalThis.self
    const harness = createWorkerHarness()

    const originalPerformance = globalThis.performance
    let nowMs = 0
    globalThis.performance = {
        now() {
            nowMs += 50
            return nowMs
        }
    }

    try {
        await loadWorker(harness)

        const sequence = [
            { dataCarrierDetect: true, dataSetReady: false, ringIndicator: false },
            { dataCarrierDetect: false, dataSetReady: false, ringIndicator: false },
            { dataCarrierDetect: true, dataSetReady: false, ringIndicator: false },
            { dataCarrierDetect: false, dataSetReady: false, ringIndicator: false },
            { dataCarrierDetect: true, dataSetReady: false, ringIndicator: false },
            { dataCarrierDetect: true, dataSetReady: false, ringIndicator: false },
            { dataCarrierDetect: true, dataSetReady: false, ringIndicator: false }
        ]

        let readIndex = 0
        const port = {
            async open() {},
            async setSignals() {},
            async close() {},
            async getSignals() {
                const value = sequence[readIndex] || sequence[sequence.length - 1]
                readIndex += 1
                return value
            },
            getInfo() {
                return {}
            }
        }

        harness.emitMessage({
            requestId: 10,
            type: 'connectPort',
            payload: { port }
        })
        await waitForMessage(harness.sentMessages, (message) => message.requestId === 10)

        const cycleEvent = await waitForMessage(harness.sentMessages, (message) => message.type === 'cycle', 500)
        assert.ok(cycleEvent.payload?.cycle)
        assert.equal(cycleEvent.payload.cycle.pulses, 2)

        harness.emitMessage({ requestId: 11, type: 'disconnect', payload: {} })
        await waitForMessage(harness.sentMessages, (message) => message.requestId === 11)
    } finally {
        globalThis.self = previousSelf
        globalThis.performance = originalPerformance
    }
})

/**
 * Verifies worker request failures return structured error responses.
 * @returns {Promise<void>}
 */
test('measurement worker returns structured errors for invalid commands', async () => {
    const previousSelf = globalThis.self
    const harness = createWorkerHarness()
    try {
        await loadWorker(harness)

        harness.emitMessage({
            requestId: 21,
            type: 'start',
            payload: {}
        })

        const errorResponse = await waitForMessage(harness.sentMessages, (message) => message.requestId === 21)
        assert.equal(errorResponse.ok, false)
        assert.equal(errorResponse.error.code, 'WORKER_ERROR')
        assert.match(errorResponse.error.message, /Port is not connected/i)

        const errorEvent = await waitForMessage(harness.sentMessages, (message) => message.type === 'error')
        assert.equal(errorEvent.payload.code, 'WORKER_ERROR')
    } finally {
        globalThis.self = previousSelf
    }
})
