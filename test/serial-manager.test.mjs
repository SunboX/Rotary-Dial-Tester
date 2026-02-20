import assert from 'node:assert/strict'
import test from 'node:test'
import { SerialManager, WEB_SERIAL_MISSING_CODE, WEB_SERIAL_USER_ACTION_REQUIRED_CODE } from '../src/js/serial/SerialManager.mjs'

/**
 * Creates a stub SerialPort implementation for testing.
 * @returns {object}
 */
function createPortStub() {
    const calls = {
        open: 0,
        close: 0,
        setSignals: [],
        getSignals: 0
    }

    return {
        calls,
        async open() {
            calls.open += 1
        },
        async close() {
            calls.close += 1
        },
        async setSignals(signals) {
            calls.setSignals.push(signals)
        },
        async getSignals() {
            calls.getSignals += 1
            return {}
        },
        getInfo() {
            return { usbVendorId: 0x0403, usbProductId: 0x6001 }
        }
    }
}

test('connect opens the port and sets RTS', async () => {
    const originalNavigator = globalThis.navigator
    const port = createPortStub()
    globalThis.navigator = {
        serial: {
            async requestPort() {
                return port
            }
        }
    }

    try {
        const manager = new SerialManager()
        const result = await manager.connect()

        assert.equal(result, port)
        assert.equal(manager.isOpen, true)
        assert.equal(port.calls.open, 1)
        assert.deepEqual(port.calls.setSignals[0], { requestToSend: true })
        assert.equal(manager.getInfoString(), 'USB VID 0x0403 - PID 0x6001')

        await manager.disconnect()
        assert.equal(manager.isOpen, false)
        assert.equal(port.calls.close, 1)
        assert.deepEqual(port.calls.setSignals[1], { requestToSend: false, dataTerminalReady: false })
    } finally {
        globalThis.navigator = originalNavigator
    }
})

/**
 * Ensures connect rejects with a tagged error when WebSerial is unavailable.
 * @returns {Promise<void>}
 */
test('connect reports missing WebSerial support', async () => {
    const originalNavigator = globalThis.navigator
    globalThis.navigator = {}

    try {
        const manager = new SerialManager()
        await assert.rejects(manager.connect(), (err) => {
            assert.equal(err.code, WEB_SERIAL_MISSING_CODE)
            return true
        })
    } finally {
        globalThis.navigator = originalNavigator
    }
})

/**
 * Verifies connectKnownOrPrompt uses an already-granted port before prompting.
 * @returns {Promise<void>}
 */
test('connectKnownOrPrompt prefers known ports', async () => {
    const originalNavigator = globalThis.navigator
    const knownPort = createPortStub()
    const calls = { requestPort: 0, getPorts: 0 }

    globalThis.navigator = {
        serial: {
            async getPorts() {
                calls.getPorts += 1
                return [knownPort]
            },
            async requestPort() {
                calls.requestPort += 1
                throw new Error('requestPort should not be called when known ports exist')
            }
        }
    }

    try {
        const manager = new SerialManager()
        const result = await manager.connectKnownOrPrompt()
        assert.equal(result, knownPort)
        assert.equal(calls.getPorts, 1)
        assert.equal(calls.requestPort, 0)
        assert.equal(manager.isOpen, true)
    } finally {
        globalThis.navigator = originalNavigator
    }
})

/**
 * Verifies connectKnownOrPrompt falls back to requestPort when no known ports exist.
 * @returns {Promise<void>}
 */
test('connectKnownOrPrompt prompts when known ports are unavailable', async () => {
    const originalNavigator = globalThis.navigator
    const promptedPort = createPortStub()
    const calls = { requestPort: 0, getPorts: 0 }

    globalThis.navigator = {
        serial: {
            async getPorts() {
                calls.getPorts += 1
                return []
            },
            async requestPort() {
                calls.requestPort += 1
                return promptedPort
            }
        }
    }

    try {
        const manager = new SerialManager()
        const result = await manager.connectKnownOrPrompt()
        assert.equal(result, promptedPort)
        assert.equal(calls.getPorts, 1)
        assert.equal(calls.requestPort, 1)
        assert.equal(manager.isOpen, true)
    } finally {
        globalThis.navigator = originalNavigator
    }
})

/**
 * Verifies connectKnownOrPrompt surfaces user-activation errors with a stable code.
 * @returns {Promise<void>}
 */
test('connectKnownOrPrompt reports user action required', async () => {
    const originalNavigator = globalThis.navigator
    globalThis.navigator = {
        serial: {
            async getPorts() {
                return []
            },
            async requestPort() {
                const error = new Error('Must be handling a user gesture to show a permission request.')
                error.name = 'SecurityError'
                throw error
            }
        }
    }

    try {
        const manager = new SerialManager()
        await assert.rejects(manager.connectKnownOrPrompt(), (err) => {
            assert.equal(err.code, WEB_SERIAL_USER_ACTION_REQUIRED_CODE)
            return true
        })
    } finally {
        globalThis.navigator = originalNavigator
    }
})
