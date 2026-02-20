import { t } from '../i18n.mjs'

/**
 * Error code used when the Web Serial API is unavailable.
 * @type {string}
 */
export const WEB_SERIAL_MISSING_CODE = 'WEB_SERIAL_MISSING'

/**
 * Error code used when a direct user interaction is required for Web Serial.
 * @type {string}
 */
export const WEB_SERIAL_USER_ACTION_REQUIRED_CODE = 'WEB_SERIAL_USER_ACTION_REQUIRED'

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
        this.#assertWebSerialAvailable()
        const port = await navigator.serial.requestPort()
        return await this.#openPort(port)
    }

    /**
     * Connects to a previously granted port when possible, otherwise prompts the user.
     * @returns {Promise<SerialPort>}
     */
    async connectKnownOrPrompt() {
        this.#assertWebSerialAvailable()

        const getPorts = navigator.serial.getPorts?.bind(navigator.serial)
        const knownPorts = typeof getPorts === 'function' ? await getPorts() : []

        for (const knownPort of knownPorts) {
            try {
                return await this.#openPort(knownPort)
            } catch {}
        }

        try {
            return await this.connect()
        } catch (err) {
            if (this.#isUserActivationError(err)) {
                const error = new Error(t('errors.webSerialUserActionRequired'))
                error.code = WEB_SERIAL_USER_ACTION_REQUIRED_CODE
                error.cause = err
                throw error
            }
            throw err
        }
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
        if (!this.#port) throw new Error(t('errors.portNotOpen'))
        return await this.#port.getSignals()
    }

    /**
     * Returns a readable label for the active port.
     * @returns {string}
     */
    getInfoString() {
        if (!this.#port) return t('port.notConnected')
        try {
            const info = this.#port.getInfo?.()
            if (info && (info.usbVendorId || info.usbProductId)) {
                const vid = info.usbVendorId ? '0x' + info.usbVendorId.toString(16).padStart(4, '0') : '-'
                const pid = info.usbProductId ? '0x' + info.usbProductId.toString(16).padStart(4, '0') : '-'
                return `USB VID ${vid} - PID ${pid}`
            }
        } catch {}
        return t('port.connected')
    }

    /**
     * Validates that Web Serial is available in the runtime.
     * @returns {void}
     */
    #assertWebSerialAvailable() {
        if (!('serial' in navigator)) {
            const error = new Error(t('errors.webSerialMissing'))
            // Tag the error so the UI can attach a compatibility link.
            error.code = WEB_SERIAL_MISSING_CODE
            throw error
        }
    }

    /**
     * Opens the provided SerialPort and applies initial signal defaults.
     * @param {SerialPort} port
     * @returns {Promise<SerialPort>}
     */
    async #openPort(port) {
        await port.open({
            baudRate: 300,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            flowControl: 'none'
        })

        // Keep the original logic where RTS provides the "H source".
        await port.setSignals({ requestToSend: true })

        this.#port = port
        return port
    }

    /**
     * Detects permission failures that usually indicate missing user activation.
     * @param {unknown} err
     * @returns {boolean}
     */
    #isUserActivationError(err) {
        const name = String(err?.name || '')
        const message = String(err?.message || '').toLowerCase()
        if (name === 'SecurityError' || name === 'NotAllowedError' || name === 'InvalidStateError') return true
        return message.includes('user gesture') || message.includes('user activation')
    }
}
