import { sleep } from '../utils/sleep.mjs'

/**
 * WebSerial implementation of the core rotary-dial test logic:
 * - nsi = DCD, nsa = RI, nsr = DSR
 * - RTS is set to 1 on connect (SerialManager)
 * - Measurement runs as polling (similar to WaitWindowEvent(1) + timeGetTime_()).
 */
export class RotaryTester {
    /**
     * @param {object} deps
     * @param {import("../serial/SerialManager.mjs").SerialManager} deps.serial
     * @param {(signals: object)=>void} deps.onSignals
     * @param {(cycle: object)=>void} deps.onCycle
     * @param {(msg: string)=>void} deps.onWarn
     */
    constructor({ serial, onSignals, onCycle, onWarn }) {
        this.serial = serial
        this.onSignals = onSignals
        this.onCycle = onCycle
        this.onWarn = onWarn

        // Debounce delay in milliseconds (EP step).
        this.debounceMs = 0

        this.pollIntervalMs = 1

        // state
        this.running = false
        this._resetAll()
    }

    /**
     * Sets the debounce time in milliseconds.
     * @param {number} ms
     * @returns {void}
     */
    setDebounceMs(ms) {
        this.debounceMs = Math.max(0, Math.min(10, Number(ms) || 0))
    }

    /**
     * Returns the current monotonic time in milliseconds.
     * @returns {number}
     */
    _nowMs() {
        // performance.now() is stable and high-resolution, similar to timeGetTime_()
        return performance.now()
    }

    /**
     * Resets all internal tracking state.
     * @returns {void}
     */
    _resetAll() {
        // arrays store timestamps of state changes
        this.nsiTimes = []
        this.nsaTimes = []
        this.nsrTimes = []

        this.nsiState = null // boolean
        this.nsaState = null
        this.nsrState = null

        this.hasEvaluatedCycle = false // PB: evaluate only once per dial
        this.nsaMissing = true // PB: true -> no nsa detected/connected
    }

    /**
     * Resets the state for a single dial cycle.
     * @returns {void}
     */
    _resetCycle() {
        this.nsiTimes = []
        this.nsaTimes = []
        this.nsrTimes = []
        this.hasEvaluatedCycle = false
        this.nsaMissing = true
    }

    /**
     * Starts polling the serial signals and processing cycles.
     * @returns {Promise<void>}
     */
    async start() {
        if (this.running) return
        if (!this.serial.isOpen) throw new Error('Port not connected.')

        // Initial status read (PB: check if nsi is open)
        const sig = await this.serial.getSignals()
        this.nsiState = !!sig.dataCarrierDetect // DCD
        this.nsrState = !!sig.dataSetReady // DSR
        this.nsaState = !!sig.ringIndicator // RI

        // PB: DCD should be 1, but we keep running and wait for the first closure.
        if (!this.nsiState) {
            this.onWarn?.('nsi is open (DCD=0). Waiting for the first closure.')
        }

        this.running = true
        this._loop().catch((err) => {
            console.error(err)
            this.onWarn?.(String(err?.message || err))
            this.running = false
        })
    }

    /**
     * Stops the polling loop.
     * @returns {void}
     */
    stop() {
        this.running = false
    }

    /**
     * Polls signals continuously while the tester is running.
     * @returns {Promise<void>}
     */
    async _loop() {
        while (this.running) {
            const sig = await this.serial.getSignals()

            // live status push (UI)
            this.onSignals?.(sig)

            // --- nsa (RI) without debounce (as in PB)
            this._handleNsa(!!sig.ringIndicator)

            // --- nsr (DSR) without debounce
            this._handleNsr(!!sig.dataSetReady)

            // --- nsi (DCD) with debounce: read twice with EP delay in between
            const dcd1 = !!sig.dataCarrierDetect
            if (this.debounceMs > 0) {
                await sleep(this.debounceMs)
                const sig2 = await this.serial.getSignals()
                const dcd2 = !!sig2.dataCarrierDetect
                if (dcd1 === dcd2) this._handleNsi(dcd2)
            } else {
                this._handleNsi(dcd1)
            }

            this._maybeFinalize()

            await sleep(this.pollIntervalMs)
        }
    }

    /**
     * Tracks changes on the nsa (RI) line.
     * @param {boolean} newState
     * @returns {void}
     */
    _handleNsa(newState) {
        if (this.nsaState === null) {
            this.nsaState = newState
            return
        }
        if (newState === this.nsaState) return

        // PB: If na==2 and another change arrives -> new dial -> reset
        if (this.nsaTimes.length >= 2) {
            this._resetCycle()
        }
        this.nsaTimes.push(this._nowMs())
        this.nsaState = newState
        this.nsaMissing = false
    }

    /**
     * Tracks changes on the nsr (DSR) line.
     * @param {boolean} newState
     * @returns {void}
     */
    _handleNsr(newState) {
        if (this.nsrState === null) {
            this.nsrState = newState
            return
        }
        if (newState === this.nsrState) return

        this.nsrTimes.push(this._nowMs())
        this.nsrState = newState
    }

    /**
     * Tracks changes on the nsi (DCD) line.
     * @param {boolean} newState
     * @returns {void}
     */
    _handleNsi(newState) {
        if (this.nsiState === null) {
            this.nsiState = newState
            return
        }
        if (newState === this.nsiState) return

        this.nsiTimes.push(this._nowMs())
        this.nsiState = newState
    }

    /**
     * Determines whether a cycle is complete and emits results.
     * @returns {void}
     */
    _maybeFinalize() {
        const ni = this.nsiTimes.length

        // PB: if no nsa and last nsi >90ms, reset with too few pulses or after evaluation
        if (this.nsaTimes.length === 0 && ni > 0) {
            const dt = this._nowMs() - this.nsiTimes[ni - 1]
            if (dt > 90) {
                if (ni < 4 || this.hasEvaluatedCycle) {
                    this._resetCycle()
                    return
                }
            }
        }

        // PB: if ni>2 && not yet evaluated && time-lastNsi>100 => evaluate
        if (ni > 2 && !this.hasEvaluatedCycle) {
            const dt = this._nowMs() - this.nsiTimes[ni - 1]
            if (dt > 100) {
                const cycle = this._computeCycle()
                this.hasEvaluatedCycle = true
                if (cycle) this.onCycle?.(cycle)
            }
        }
    }

    /**
     * Computes the metrics for the current cycle.
     * @returns {object|null}
     */
    _computeCycle() {
        // Copy and remove offset (PB: nn=nsi(0); nsi(x)-=nn)
        const raw = [...this.nsiTimes]
        if (raw.length < 4) return null

        const nn = raw[0]
        const t = raw.map((v) => Math.max(0, Math.round(v - nn)))

        // pulses = ni/2 (PB LEDs at 2,4,6...)
        const pulses = Math.floor(t.length / 2)
        const digit = pulses === 10 ? 0 : pulses

        // nsaOpenTime: PB uses nsa(1) as "nsa opens"
        // Robust: find the timestamp when RI switches to 0 (if present)
        let nsaOpenMs = null
        if (this.nsaTimes.length > 0) {
            // We do not know the state per entry, only the toggle timestamps.
            // Assumption: RI is idle at 0, becomes 1 during dial, then returns to 0.
            // => 2nd toggle (index 1) is "opens" (back to 0).
            if (this.nsaTimes.length >= 2) {
                nsaOpenMs = Math.max(0, Math.round(this.nsaTimes[1] - nn))
            } else {
                // fallback: use the 1st toggle
                nsaOpenMs = Math.max(0, Math.round(this.nsaTimes[0] - nn))
            }
            this.nsaMissing = false
        }

        // nsrOnTime (diagram only)
        let nsrOnMs = null
        if (this.nsrTimes.length > 0) {
            // PB uses nsr(1)
            nsrOnMs = Math.max(0, Math.round(this.nsrTimes[0] - nn))
        }

        // nsi open/closed totals as in PB:
        // - off: sum of "0 phases" of pulses, excluding the first
        // - on:  sum of "1 phases" between pulses (one fewer than selected)
        // Assumption: idle = 1, first toggle is 0 (opens), order: 0..1..0..1...
        let nsiOpenTotalMs = 0
        for (let i = 2; i + 1 < t.length; i += 2) nsiOpenTotalMs += t[i + 1] - t[i]

        let nsiClosedTotalMs = 0
        for (let i = 2; i < t.length; i += 2) nsiClosedTotalMs += t[i] - t[i - 1]

        const denomPeriods = Math.max(1, t.length / 2 - 1)
        const avgPeriodMs = (nsiOpenTotalMs + nsiClosedTotalMs) / denomPeriods
        const fHz = avgPeriodMs > 0 ? 1000 / avgPeriodMs : 0

        const dutyClosed =
            nsiClosedTotalMs + nsiOpenTotalMs > 0 ? Math.round((nsiClosedTotalMs * 100) / (nsiClosedTotalMs + nsiOpenTotalMs)) : 0

        // Plausibility checks (as in PB)
        const warnings = []
        if (fHz < 7 || fHz > 13) warnings.push('WARNING: Dial speed is outside the valid range (7-13 Hz).')
        if (dutyClosed < 10 || dutyClosed > 70) warnings.push('WARNING: nsi pulse/pause ratio is outside the valid range (10-70%).')

        return {
            createdAt: new Date(),
            nnMs: nn,
            nsiTimesMs: t,
            pulses,
            digit,
            fHz: Math.round(fHz * 10) / 10,
            dutyClosed,
            nsaOpenMs,
            nsrOnMs,
            debounceMs: this.debounceMs,
            hasNsa: nsaOpenMs !== null,
            hasNsr: nsrOnMs !== null,
            warnings
        }
    }
}
