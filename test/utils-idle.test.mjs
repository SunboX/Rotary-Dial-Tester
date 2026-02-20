import assert from 'node:assert/strict'
import test from 'node:test'
import { scheduleIdle } from '../src/js/utils/idle.mjs'

/**
 * Captures requestIdleCallback globals and returns a restore callback.
 * @returns {() => void}
 */
function captureIdleGlobals() {
    const hadRequestIdleCallback = Object.prototype.hasOwnProperty.call(globalThis, 'requestIdleCallback')
    const hadCancelIdleCallback = Object.prototype.hasOwnProperty.call(globalThis, 'cancelIdleCallback')
    const originalRequestIdleCallback = globalThis.requestIdleCallback
    const originalCancelIdleCallback = globalThis.cancelIdleCallback

    return () => {
        if (hadRequestIdleCallback) {
            globalThis.requestIdleCallback = originalRequestIdleCallback
        } else {
            delete globalThis.requestIdleCallback
        }

        if (hadCancelIdleCallback) {
            globalThis.cancelIdleCallback = originalCancelIdleCallback
        } else {
            delete globalThis.cancelIdleCallback
        }
    }
}

/**
 * Verifies that scheduleIdle delegates to requestIdleCallback when available.
 * @returns {Promise<void>}
 */
test('scheduleIdle uses requestIdleCallback when available', async () => {
    const restore = captureIdleGlobals()
    let observedTimeout = null

    try {
        globalThis.requestIdleCallback = (callback, options = {}) => {
            observedTimeout = options.timeout
            setTimeout(() => {
                callback({
                    didTimeout: false,
                    timeRemaining: () => 12
                })
            }, 0)
            return 42
        }
        globalThis.cancelIdleCallback = () => {}

        const deadline = await new Promise((resolve) => {
            scheduleIdle((incomingDeadline) => {
                resolve(incomingDeadline)
            }, { timeout: 321 })
        })

        assert.equal(observedTimeout, 321)
        assert.equal(deadline.didTimeout, false)
        assert.equal(deadline.timeRemaining(), 12)
    } finally {
        restore()
    }
})

/**
 * Ensures cancellation is forwarded to cancelIdleCallback in native-idle mode.
 * @returns {void}
 */
test('scheduleIdle forwards cancellation to cancelIdleCallback', () => {
    const restore = captureIdleGlobals()
    let canceledId = null

    try {
        globalThis.requestIdleCallback = () => 99
        globalThis.cancelIdleCallback = (idleId) => {
            canceledId = idleId
        }

        const cancel = scheduleIdle(() => {})
        cancel()

        assert.equal(canceledId, 99)
    } finally {
        restore()
    }
})

/**
 * Confirms the fallback scheduler invokes work with a deadline-like object.
 * @returns {Promise<void>}
 */
test('scheduleIdle falls back to setTimeout when requestIdleCallback is unavailable', async () => {
    const restore = captureIdleGlobals()

    try {
        delete globalThis.requestIdleCallback
        delete globalThis.cancelIdleCallback

        const deadline = await new Promise((resolve) => {
            scheduleIdle((incomingDeadline) => {
                resolve(incomingDeadline)
            }, { fallbackBudgetMs: 5 })
        })

        assert.equal(deadline.didTimeout, true)
        const remaining = deadline.timeRemaining()
        assert.ok(remaining >= 0)
        assert.ok(remaining <= 5)
    } finally {
        restore()
    }
})

/**
 * Verifies that canceling fallback work prevents the scheduled callback from running.
 * @returns {Promise<void>}
 */
test('scheduleIdle cancellation stops fallback callbacks', async () => {
    const restore = captureIdleGlobals()
    let called = false

    try {
        delete globalThis.requestIdleCallback
        delete globalThis.cancelIdleCallback

        const cancel = scheduleIdle(() => {
            called = true
        })
        cancel()

        await new Promise((resolve) => {
            setTimeout(resolve, 10)
        })

        assert.equal(called, false)
    } finally {
        restore()
    }
})
