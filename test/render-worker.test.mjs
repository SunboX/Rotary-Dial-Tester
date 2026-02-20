import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * Creates a minimal worker global harness.
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
 * Creates a canvas-like stub with a 2D context recorder.
 * @param {number} width
 * @param {number} height
 * @returns {{ canvas: object, calls: Record<string, number> }}
 */
function createCanvasStub(width = 1400, height = 150) {
    const calls = {}
    const count = (name) => {
        calls[name] = (calls[name] || 0) + 1
    }

    const ctx = {
        clearRect() {
            count('clearRect')
        },
        fillRect() {
            count('fillRect')
        },
        beginPath() {
            count('beginPath')
        },
        moveTo() {
            count('moveTo')
        },
        lineTo() {
            count('lineTo')
        },
        stroke() {
            count('stroke')
        },
        fillText() {
            count('fillText')
        },
        arc() {
            count('arc')
        },
        fill() {
            count('fill')
        },
        save() {
            count('save')
        },
        restore() {
            count('restore')
        },
        translate() {
            count('translate')
        },
        rotate() {
            count('rotate')
        },
        drawImage() {
            count('drawImage')
        },
        measureText(text) {
            return { width: String(text).length * 6 }
        }
    }

    return {
        calls,
        canvas: {
            width,
            height,
            getContext() {
                return ctx
            },
            async convertToBlob({ type } = {}) {
                return new Blob(['render-worker'], { type: type || 'image/png' })
            }
        }
    }
}

/**
 * Waits for one matching message emitted by worker script.
 * @param {Array<object>} sentMessages
 * @param {(message: object) => boolean} predicate
 * @param {number} [timeoutMs=300]
 * @returns {Promise<object>}
 */
async function waitForMessage(sentMessages, predicate, timeoutMs = 300) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
        const match = sentMessages.find(predicate)
        if (match) return match
        await new Promise((resolve) => setTimeout(resolve, 2))
    }
    throw new Error('Timed out waiting for render worker message.')
}

/**
 * Loads RenderWorker into mocked worker global scope.
 * @param {{ workerSelf: object }} harness
 * @returns {Promise<void>}
 */
async function loadWorker(harness) {
    globalThis.self = harness.workerSelf
    await import(`../src/js/workers/RenderWorker.mjs?test=${Date.now()}-${Math.random()}`)
}

/**
 * Installs an OffscreenCanvas mock compatible with render worker export flow.
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
            const { canvas } = createCanvasStub(width, height)
            this.width = width
            this.height = height
            this._canvas = canvas
        }

        /**
         * @returns {object}
         */
        getContext() {
            return this._canvas.getContext('2d')
        }

        /**
         * @param {object} [options]
         * @returns {Promise<Blob>}
         */
        async convertToBlob(options) {
            return await this._canvas.convertToBlob(options)
        }
    }

    return () => {
        globalThis.OffscreenCanvas = previousOffscreenCanvas
    }
}

/**
 * Verifies diagram draw requests are dispatched to attached canvas contexts.
 * @returns {Promise<void>}
 */
test('render worker draws impulse diagrams on attached canvases', async () => {
    const previousSelf = globalThis.self
    const restoreOffscreenCanvas = installOffscreenCanvasMock()
    const harness = createWorkerHarness()
    try {
        await loadWorker(harness)

        const { canvas, calls } = createCanvasStub(1400, 150)

        harness.emitMessage({ requestId: 1, type: 'attachDiagramCanvas', payload: { diagramId: 'd1', canvas } })
        await waitForMessage(harness.sentMessages, (message) => message.requestId === 1)

        harness.emitMessage({
            requestId: 2,
            type: 'drawDiagram',
            payload: {
                diagramId: 'd1',
                cycle: {
                    createdAt: new Date().toISOString(),
                    nsiTimesMs: [0, 50, 100, 150],
                    pulses: 2,
                    digit: 2,
                    fHz: 10,
                    dutyClosed: 50,
                    nsaOpenMs: null,
                    nsrOnMs: null,
                    debounceMs: 0,
                    hasNsa: false,
                    hasNsr: false,
                    warnings: []
                },
                ideal: false
            }
        })

        await waitForMessage(harness.sentMessages, (message) => message.requestId === 2)
        assert.ok((calls.stroke || 0) > 0)
    } finally {
        globalThis.self = previousSelf
        restoreOffscreenCanvas()
    }
})

/**
 * Verifies runtime analysis drawing is dispatched to the attached analysis canvas.
 * @returns {Promise<void>}
 */
test('render worker draws runtime analysis on attached analysis canvas', async () => {
    const previousSelf = globalThis.self
    const restoreOffscreenCanvas = installOffscreenCanvasMock()
    const harness = createWorkerHarness()
    try {
        await loadWorker(harness)

        const { canvas, calls } = createCanvasStub(1100, 190)

        harness.emitMessage({ requestId: 10, type: 'attachAnalysisCanvas', payload: { canvas } })
        await waitForMessage(harness.sentMessages, (message) => message.requestId === 10)

        harness.emitMessage({
            requestId: 11,
            type: 'drawRuntime',
            payload: {
                cycles: [
                    { nsiTimesMs: [0, 50, 100, 150], hasNsa: false },
                    { nsiTimesMs: [0, 55, 110, 165], hasNsa: false }
                ]
            }
        })

        await waitForMessage(harness.sentMessages, (message) => message.requestId === 11)
        assert.ok((calls.fillRect || 0) > 0)
        assert.ok((calls.arc || 0) > 0)
    } finally {
        globalThis.self = previousSelf
        restoreOffscreenCanvas()
    }
})

/**
 * Verifies export requests return image blobs.
 * @returns {Promise<void>}
 */
test('render worker returns blob payloads for strip export', async () => {
    const previousSelf = globalThis.self
    const restoreOffscreenCanvas = installOffscreenCanvasMock()
    const harness = createWorkerHarness()
    try {
        await loadWorker(harness)

        const diagramA = createCanvasStub(1400, 150).canvas
        const diagramB = createCanvasStub(1400, 150).canvas

        harness.emitMessage({ requestId: 20, type: 'attachDiagramCanvas', payload: { diagramId: 'a', canvas: diagramA } })
        await waitForMessage(harness.sentMessages, (message) => message.requestId === 20)

        harness.emitMessage({ requestId: 21, type: 'attachDiagramCanvas', payload: { diagramId: 'b', canvas: diagramB } })
        await waitForMessage(harness.sentMessages, (message) => message.requestId === 21)

        harness.emitMessage({
            requestId: 22,
            type: 'exportStrip',
            payload: {
                diagramIds: ['a', 'b'],
                format: 'png'
            }
        })

        const response = await waitForMessage(harness.sentMessages, (message) => message.requestId === 22)
        assert.equal(response.ok, true)
        assert.ok(response.payload.blob instanceof Blob)
        assert.ok(response.payload.blob.size > 0)
        assert.equal(response.payload.diagramCount, 2)
    } finally {
        globalThis.self = previousSelf
        restoreOffscreenCanvas()
    }
})
