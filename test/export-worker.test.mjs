import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * Creates a minimal worker harness for script-level worker tests.
 * @returns {{ workerSelf: object, sentMessages: Array<object>, emitMessage: (message: object) => void }}
 */
function createWorkerHarness() {
    const listeners = {
        message: []
    }
    const sentMessages = []

    const workerSelf = {
        addEventListener(type, listener) {
            if (!listeners[type]) listeners[type] = []
            listeners[type].push(listener)
        },
        postMessage(message) {
            sentMessages.push(message)
        },
        close() {}
    }

    return {
        workerSelf,
        sentMessages,
        emitMessage(message) {
            for (const listener of listeners.message || []) {
                listener({ data: message })
            }
        }
    }
}

/**
 * Waits for one matching worker message in harness output.
 * @param {Array<object>} sentMessages
 * @param {(message: object) => boolean} predicate
 * @param {number} [timeoutMs=400]
 * @returns {Promise<object>}
 */
async function waitForMessage(sentMessages, predicate, timeoutMs = 400) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
        const match = sentMessages.find(predicate)
        if (match) return match
        await new Promise((resolve) => setTimeout(resolve, 2))
    }

    throw new Error('Timed out waiting for export worker message.')
}

/**
 * Creates a bitmap-like transferable stub.
 * @param {number} [width=1400]
 * @param {number} [height=150]
 * @returns {{ width: number, height: number, closed: boolean, close: () => void }}
 */
function createBitmapStub(width = 1400, height = 150) {
    return {
        width,
        height,
        closed: false,
        close() {
            this.closed = true
        }
    }
}

/**
 * Installs an OffscreenCanvas mock used by export worker tests.
 * @returns {() => void}
 */
function installOffscreenCanvasMock() {
    const previousOffscreenCanvas = globalThis.OffscreenCanvas

    globalThis.OffscreenCanvas = class MockOffscreenCanvas {
        /**
         * @param {number} width
         * @param {number} height
         */
        constructor(width, height) {
            this.width = width
            this.height = height
            this.calls = {
                fillRect: 0,
                drawImage: 0,
                clearRect: 0
            }
        }

        /**
         * @returns {object}
         */
        getContext() {
            return {
                fillStyle: '',
                fillRect: () => {
                    this.calls.fillRect += 1
                },
                drawImage: () => {
                    this.calls.drawImage += 1
                },
                clearRect: () => {
                    this.calls.clearRect += 1
                }
            }
        }

        /**
         * @param {object} [options]
         * @returns {Promise<Blob>}
         */
        async convertToBlob(options = {}) {
            return new Blob(['export-worker-test'], { type: options.type || 'image/png' })
        }
    }

    return () => {
        globalThis.OffscreenCanvas = previousOffscreenCanvas
    }
}

/**
 * Loads worker module into a mocked worker global scope.
 * @param {{ workerSelf: object }} harness
 * @returns {Promise<void>}
 */
async function loadWorker(harness) {
    globalThis.self = harness.workerSelf
    await import(`../src/js/workers/ExportWorker.mjs?test=${Date.now()}-${Math.random()}`)
}

/**
 * Verifies strip composition returns a non-empty blob from multiple bitmaps.
 * @returns {Promise<void>}
 */
test('export worker composes strip from multiple bitmaps', async () => {
    const previousSelf = globalThis.self
    const restoreOffscreenCanvas = installOffscreenCanvasMock()
    const harness = createWorkerHarness()

    try {
        await loadWorker(harness)

        const bitmapA = createBitmapStub(800, 200)
        const bitmapB = createBitmapStub(800, 200)

        harness.emitMessage({
            requestId: 1,
            type: 'composeStripFromBitmaps',
            payload: {
                bitmaps: [bitmapA, bitmapB],
                width: 800,
                height: 200,
                format: 'png'
            }
        })

        const response = await waitForMessage(harness.sentMessages, (message) => message.requestId === 1)
        assert.equal(response.ok, true)
        assert.ok(response.payload.blob instanceof Blob)
        assert.ok(response.payload.blob.size > 0)
        assert.equal(response.payload.diagramCount, 2)
        assert.equal(bitmapA.closed, true)
        assert.equal(bitmapB.closed, true)
    } finally {
        globalThis.self = previousSelf
        restoreOffscreenCanvas()
    }
})

/**
 * Verifies single-bitmap export returns a non-empty blob payload.
 * @returns {Promise<void>}
 */
test('export worker exports a single bitmap', async () => {
    const previousSelf = globalThis.self
    const restoreOffscreenCanvas = installOffscreenCanvasMock()
    const harness = createWorkerHarness()

    try {
        await loadWorker(harness)

        const bitmap = createBitmapStub(700, 150)

        harness.emitMessage({
            requestId: 2,
            type: 'exportSingleBitmap',
            payload: {
                bitmap,
                width: 700,
                height: 150,
                format: 'jpg'
            }
        })

        const response = await waitForMessage(harness.sentMessages, (message) => message.requestId === 2)
        assert.equal(response.ok, true)
        assert.ok(response.payload.blob instanceof Blob)
        assert.ok(response.payload.blob.size > 0)
        assert.equal(bitmap.closed, true)
    } finally {
        globalThis.self = previousSelf
        restoreOffscreenCanvas()
    }
})
