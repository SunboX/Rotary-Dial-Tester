import assert from 'node:assert/strict'
import test from 'node:test'
import { SerialManager } from '../src/js/serial/SerialManager.mjs'

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

