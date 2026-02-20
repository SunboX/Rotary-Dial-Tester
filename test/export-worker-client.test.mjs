import assert from 'node:assert/strict'
import test from 'node:test'
import { ExportWorkerClient } from '../src/js/workers/ExportWorkerClient.mjs'

/**
 * Creates a mock Worker object with programmable postMessage behavior.
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
        }
    }
}

/**
 * Creates a minimal canvas-like object used by createImageBitmap mocks.
 * @param {number} [width=1400]
 * @param {number} [height=150]
 * @returns {{ width: number, height: number }}
 */
function createCanvasStub(width = 1400, height = 150) {
    return { width, height }
}

/**
 * Verifies export client resolves correlated strip export responses.
 * @returns {Promise<void>}
 */
test('ExportWorkerClient resolves strip export responses', async () => {
    const originalWorker = globalThis.Worker
    const originalOffscreenCanvas = globalThis.OffscreenCanvas
    const originalCreateImageBitmap = globalThis.createImageBitmap

    globalThis.Worker = class MockWorker {}
    globalThis.OffscreenCanvas = class MockOffscreenCanvas {}
    globalThis.createImageBitmap = async (canvas) => ({
        width: canvas.width,
        height: canvas.height,
        close() {}
    })

    try {
        const worker = createMockWorker((message, workerInstance) => {
            setTimeout(() => {
                workerInstance.emitMessage({
                    requestId: message.requestId,
                    ok: true,
                    payload: {
                        blob: new Blob(['client-export-strip'], { type: 'image/png' }),
                        mimeType: 'image/png',
                        diagramCount: 2
                    }
                })
            }, 0)
        })

        const client = new ExportWorkerClient({
            workerFactory: () => worker
        })

        const result = await client.exportStripFromCanvases([createCanvasStub(), createCanvasStub()], 'png')
        assert.ok(result.blob instanceof Blob)
        assert.equal(result.diagramCount, 2)

        await client.dispose()
    } finally {
        globalThis.Worker = originalWorker
        globalThis.OffscreenCanvas = originalOffscreenCanvas
        globalThis.createImageBitmap = originalCreateImageBitmap
    }
})

/**
 * Verifies export client rejects timed-out requests.
 * @returns {Promise<void>}
 */
test('ExportWorkerClient rejects timed-out requests', async () => {
    const originalWorker = globalThis.Worker
    const originalOffscreenCanvas = globalThis.OffscreenCanvas
    const originalCreateImageBitmap = globalThis.createImageBitmap

    globalThis.Worker = class MockWorker {}
    globalThis.OffscreenCanvas = class MockOffscreenCanvas {}
    globalThis.createImageBitmap = async (canvas) => ({
        width: canvas.width,
        height: canvas.height,
        close() {}
    })

    try {
        const worker = createMockWorker(() => {
            // Intentionally no response.
        })

        const client = new ExportWorkerClient({
            workerFactory: () => worker,
            requestTimeoutMs: 20
        })

        await assert.rejects(client.exportSingleCanvas(createCanvasStub(), 'png'), /timed out/i)
    } finally {
        globalThis.Worker = originalWorker
        globalThis.OffscreenCanvas = originalOffscreenCanvas
        globalThis.createImageBitmap = originalCreateImageBitmap
    }
})

/**
 * Verifies worker error payloads are mapped to Error objects.
 * @returns {Promise<void>}
 */
test('ExportWorkerClient maps worker errors into thrown Error objects', async () => {
    const originalWorker = globalThis.Worker
    const originalOffscreenCanvas = globalThis.OffscreenCanvas
    const originalCreateImageBitmap = globalThis.createImageBitmap

    globalThis.Worker = class MockWorker {}
    globalThis.OffscreenCanvas = class MockOffscreenCanvas {}
    globalThis.createImageBitmap = async (canvas) => ({
        width: canvas.width,
        height: canvas.height,
        close() {}
    })

    try {
        const worker = createMockWorker((message, workerInstance) => {
            setTimeout(() => {
                workerInstance.emitMessage({
                    requestId: message.requestId,
                    ok: false,
                    error: {
                        code: 'EXPORT_FAILURE',
                        message: 'Export failed.'
                    }
                })
            }, 0)
        })

        const client = new ExportWorkerClient({
            workerFactory: () => worker
        })

        await assert.rejects(
            client.exportSingleCanvas(createCanvasStub(), 'png'),
            (error) => error instanceof Error && error.code === 'EXPORT_FAILURE' && /Export failed/i.test(error.message)
        )
    } finally {
        globalThis.Worker = originalWorker
        globalThis.OffscreenCanvas = originalOffscreenCanvas
        globalThis.createImageBitmap = originalCreateImageBitmap
    }
})
