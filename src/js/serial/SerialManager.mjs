/**
 * Thin wrapper around the Web Serial API for connecting and reading signals.
 */
export class SerialManager {
    /** @type {SerialPort|null} */
    #port = null

    /**
     * Whether a port is currently open.
     * @returns {boolean}
     */
    get isOpen() {
        return !!this.#port
    }
    /**
     * The current SerialPort instance, if any.
     * @returns {SerialPort|null}
     */
    get port() {
        return this.#port
    }

    /**
     * Opens the port selected by the user and sets initial signals.
     * @returns {Promise<SerialPort>}
     */
    async connect() {
        if (!('serial' in navigator)) {
            throw new Error('WebSerial not available. Use Chrome/Edge and https:// or localhost.')
        }
        const port = await navigator.serial.requestPort()
        await port.open({
            baudRate: 300,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            flowControl: 'none'
        })

        // Like the original: RTS = 1 as the "H source"
        await port.setSignals({ requestToSend: true })

        this.#port = port
        return port
    }

    /**
     * Closes the current port and resets modem signals.
     * @returns {Promise<void>}
     */
    async disconnect() {
        if (!this.#port) return
        try {
            await this.#port.setSignals({ requestToSend: false, dataTerminalReady: false })
        } catch {}
        try {
            await this.#port.close()
        } catch {}
        this.#port = null
    }

    /**
     * Reads current modem status signals from the port.
     * @returns {Promise<object>}
     */
    async getSignals() {
        if (!this.#port) throw new Error('Port not open.')
        return await this.#port.getSignals()
    }

    /**
     * Returns a readable label for the active port.
     * @returns {string}
     */
    getInfoString() {
        if (!this.#port) return 'not connected'
        try {
            const info = this.#port.getInfo?.()
            if (info && (info.usbVendorId || info.usbProductId)) {
                const vid = info.usbVendorId ? '0x' + info.usbVendorId.toString(16).padStart(4, '0') : '-'
                const pid = info.usbProductId ? '0x' + info.usbProductId.toString(16).padStart(4, '0') : '-'
                return `USB VID ${vid} - PID ${pid}`
            }
        } catch {}
        return 'connected'
    }
}
