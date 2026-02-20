import assert from 'node:assert/strict'
import test from 'node:test'
import { ExportWorkerClient } from '../src/js/workers/ExportWorkerClient.mjs'
import { MeasurementWorkerClient } from '../src/js/workers/MeasurementWorkerClient.mjs'
import { RenderWorkerClient } from '../src/js/workers/RenderWorkerClient.mjs'

/**
 * Creates a lightweight Worker mock with programmable postMessage behavior.
 * @param {(message: object, worker: any) => void} onPostMessage
 * @returns {any}
 */
function createMockWorker(onPostMessage) {
    const listeners = {
        message: [],
        error: []
    }

    return {
        terminated: false,
        addEventListener(type, listener) {
            if (!listeners[type]) listeners[type] = []
            listeners[type].push(listener)
        },
        postMessage(message) {
            onPostMessage?.(message, this)
        },
        terminate() {
            this.terminated = true
        },
        emitMessage(message) {
            for (const listener of listeners.message || []) {
                listener({ data: message })
            }
        },
        emitError(error) {
            for (const listener of listeners.error || []) {
                listener(error)
            }
        }
    }
}

/**
 * Verifies measurement client correlates request IDs and resolves matching responses.
 * @returns {Promise<void>}
 */
test('MeasurementWorkerClient resolves matching responses', async () => {
    const originalWorker = globalThis.Worker
    globalThis.Worker = class MockWorker {}

    try {
        const worker = createMockWorker((message, workerInstance) => {
            setTimeout(() => {
                workerInstance.emitMessage({
                    requestId: message.requestId,
                    ok: true,
                    payload: { debounceMs: message.payload.debounceMs }
                })
            }, 0)
        })

        const client = new MeasurementWorkerClient({
            workerFactory: () => worker
        })

        const result = await client.setDebounce(7)
        assert.equal(result.debounceMs, 7)

        await client.dispose()
    } finally {
        globalThis.Worker = originalWorker
    }
})

/**
 * Verifies measurement client enforces request timeout handling.
 * @returns {Promise<void>}
 */
test('MeasurementWorkerClient rejects timed-out requests', async () => {
    const originalWorker = globalThis.Worker
    globalThis.Worker = class MockWorker {}

    try {
        const worker = createMockWorker(() => {
            // Intentionally no response to trigger timeout path.
        })

        const client = new MeasurementWorkerClient({
            workerFactory: () => worker,
            requestTimeoutMs: 20
        })

        await assert.rejects(client.start(), /timed out/i)
    } finally {
        globalThis.Worker = originalWorker
    }
})

/**
 * Verifies render client resolves async export responses.
 * @returns {Promise<void>}
 */
test('RenderWorkerClient resolves export responses', async () => {
    const originalWorker = globalThis.Worker
    const originalOffscreenCanvas = globalThis.OffscreenCanvas
    const originalHtmlCanvasElement = globalThis.HTMLCanvasElement

    globalThis.Worker = class MockWorker {}
    globalThis.OffscreenCanvas = class MockOffscreenCanvas {}
    globalThis.HTMLCanvasElement = class MockHtmlCanvasElement {}
    globalThis.HTMLCanvasElement.prototype.transferControlToOffscreen = function transferControlToOffscreen() {
        return {}
    }

    try {
        const worker = createMockWorker((message, workerInstance) => {
            setTimeout(() => {
                workerInstance.emitMessage({
                    requestId: message.requestId,
                    ok: true,
                    payload: {
                        blob: new Blob(['client-export'], { type: 'image/png' }),
                        mimeType: 'image/png',
                        diagramCount: 2
                    }
                })
            }, 0)
        })

        const client = new RenderWorkerClient({
            workerFactory: () => worker
        })

        const result = await client.exportStrip(['a', 'b'], 'png')
        assert.ok(result.blob instanceof Blob)
        assert.equal(result.diagramCount, 2)

        await client.dispose()
    } finally {
        globalThis.Worker = originalWorker
        globalThis.OffscreenCanvas = originalOffscreenCanvas
        globalThis.HTMLCanvasElement = originalHtmlCanvasElement
    }
})

/**
 * Verifies worker clients expose unsupported-runtime behavior for fallback decisions.
 * @returns {Promise<void>}
 */
test('worker clients reject when runtime lacks worker support', async () => {
    const originalWorker = globalThis.Worker
    const originalOffscreenCanvas = globalThis.OffscreenCanvas
    const originalHtmlCanvasElement = globalThis.HTMLCanvasElement
    const originalCreateImageBitmap = globalThis.createImageBitmap

    globalThis.Worker = undefined
    globalThis.OffscreenCanvas = undefined
    globalThis.HTMLCanvasElement = undefined
    globalThis.createImageBitmap = undefined

    try {
        assert.equal(MeasurementWorkerClient.isSupported(), false)
        assert.equal(RenderWorkerClient.isSupported(), false)
        assert.equal(ExportWorkerClient.isSupported(), false)

        const measurementClient = new MeasurementWorkerClient()
        await assert.rejects(measurementClient.start(), /workers are not supported/i)

        const exportClient = new ExportWorkerClient()
        await assert.rejects(exportClient.exportSingleCanvas({ width: 1, height: 1 }), /not supported/i)
    } finally {
        globalThis.Worker = originalWorker
        globalThis.OffscreenCanvas = originalOffscreenCanvas
        globalThis.HTMLCanvasElement = originalHtmlCanvasElement
        globalThis.createImageBitmap = originalCreateImageBitmap
    }
})
