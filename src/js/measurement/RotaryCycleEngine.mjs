/**
 * Warning keys produced by the measurement engine.
 * @type {{ NSI_OPEN: string, DIAL_SPEED: string, PULSE_PAUSE_RATIO: string }}
 */
export const WARNING_KEYS = Object.freeze({
    NSI_OPEN: 'warnings.nsiOpen',
    DIAL_SPEED: 'warnings.dialSpeed',
    PULSE_PAUSE_RATIO: 'warnings.pulsePauseRatio'
})

/**
 * Pure rotary-dial cycle engine used by both main-thread and worker-based measurement runtimes.
 */
export class RotaryCycleEngine {
    /**
     * @param {object} [options]
     * @param {() => number} [options.nowMs]
     */
    constructor(options = {}) {
        this.nowMs = typeof options.nowMs === 'function' ? options.nowMs : () => performance.now()

        /**
         * Debounce delay in milliseconds used by the outer loop.
         * @type {number}
         */
        this.debounceMs = 0

        this.resetAll()
    }

    /**
     * Sets the debounce value in milliseconds.
     * @param {number} ms
     * @returns {void}
     */
    setDebounceMs(ms) {
        this.debounceMs = Math.max(0, Math.min(10, Number(ms) || 0))
    }

    /**
     * Initializes line states from the first sampled signal snapshot.
     * @param {{ dataCarrierDetect: boolean, dataSetReady: boolean, ringIndicator: boolean }} signals
     * @returns {{ warningKey: string|null }}
     */
    initializeFromSignals(signals) {
        this.nsiState = !!signals.dataCarrierDetect
        this.nsrState = !!signals.dataSetReady
        this.nsaState = !!signals.ringIndicator

        if (!this.nsiState) {
            return { warningKey: WARNING_KEYS.NSI_OPEN }
        }
        return { warningKey: null }
    }

    /**
     * Processes a stable signal sample.
     * @param {{ dataCarrierDetect: boolean, dataSetReady: boolean, ringIndicator: boolean }} signals
     * @returns {{ cycle: object|null }}
     */
    processStableSignals(signals) {
        this.#handleNsa(!!signals.ringIndicator)
        this.#handleNsr(!!signals.dataSetReady)
        this.#handleNsi(!!signals.dataCarrierDetect)

        const cycle = this.#maybeFinalize()
        return { cycle }
    }

    /**
     * Resets the full engine state.
     * @returns {void}
     */
    resetAll() {
        /** @type {Array<number>} */
        this.nsiTimes = []
        /** @type {Array<number>} */
        this.nsaTimes = []
        /** @type {Array<number>} */
        this.nsrTimes = []

        /** @type {boolean|null} */
        this.nsiState = null
        /** @type {boolean|null} */
        this.nsaState = null
        /** @type {boolean|null} */
        this.nsrState = null

        /** @type {boolean} */
        this.hasEvaluatedCycle = false
        /** @type {boolean} */
        this.nsaMissing = true
    }

    /**
     * Resets only per-cycle captured timestamps.
     * @returns {void}
     */
    resetCycle() {
        this.nsiTimes = []
        this.nsaTimes = []
        this.nsrTimes = []
        this.hasEvaluatedCycle = false
        this.nsaMissing = true
    }

    /**
     * Handles nsa (RI) state transitions.
     * @param {boolean} newState
     * @returns {void}
     */
    #handleNsa(newState) {
        if (this.nsaState === null) {
            this.nsaState = newState
            return
        }
        if (newState === this.nsaState) return

        // Reset if a second dial cycle starts before evaluation is consumed.
        if (this.nsaTimes.length >= 2) {
            this.resetCycle()
        }
        this.nsaTimes.push(this.nowMs())
        this.nsaState = newState
        this.nsaMissing = false
    }

    /**
     * Handles nsr (DSR) state transitions.
     * @param {boolean} newState
     * @returns {void}
     */
    #handleNsr(newState) {
        if (this.nsrState === null) {
            this.nsrState = newState
            return
        }
        if (newState === this.nsrState) return

        this.nsrTimes.push(this.nowMs())
        this.nsrState = newState
    }

    /**
     * Handles nsi (DCD) state transitions.
     * @param {boolean} newState
     * @returns {void}
     */
    #handleNsi(newState) {
        if (this.nsiState === null) {
            this.nsiState = newState
            return
        }
        if (newState === this.nsiState) return

        this.nsiTimes.push(this.nowMs())
        this.nsiState = newState
    }

    /**
     * Finalizes a dial cycle when timing thresholds indicate a completed sequence.
     * @returns {object|null}
     */
    #maybeFinalize() {
        const ni = this.nsiTimes.length

        if (this.nsaTimes.length === 0 && ni > 0) {
            const dt = this.nowMs() - this.nsiTimes[ni - 1]
            if (dt > 90) {
                if (ni < 4 || this.hasEvaluatedCycle) {
                    this.resetCycle()
                    return null
                }
            }
        }

        if (ni > 2 && !this.hasEvaluatedCycle) {
            const dt = this.nowMs() - this.nsiTimes[ni - 1]
            if (dt > 100) {
                const cycle = this.computeCycle()
                this.hasEvaluatedCycle = true
                return cycle
            }
        }

        return null
    }

    /**
     * Computes rotary cycle metrics from captured timestamps.
     * @returns {object|null}
     */
    computeCycle() {
        const raw = [...this.nsiTimes]
        if (raw.length < 4) return null

        const nn = raw[0]
        const normalizedTimes = raw.map((value) => Math.max(0, Math.round(value - nn)))

        const pulses = Math.floor(normalizedTimes.length / 2)
        const digit = pulses === 10 ? 0 : pulses

        let nsaOpenMs = null
        if (this.nsaTimes.length > 0) {
            if (this.nsaTimes.length >= 2) {
                nsaOpenMs = Math.max(0, Math.round(this.nsaTimes[1] - nn))
            } else {
                nsaOpenMs = Math.max(0, Math.round(this.nsaTimes[0] - nn))
            }
            this.nsaMissing = false
        }

        let nsrOnMs = null
        if (this.nsrTimes.length > 0) {
            nsrOnMs = Math.max(0, Math.round(this.nsrTimes[0] - nn))
        }

        let nsiOpenTotalMs = 0
        for (let i = 2; i + 1 < normalizedTimes.length; i += 2) {
            nsiOpenTotalMs += normalizedTimes[i + 1] - normalizedTimes[i]
        }

        let nsiClosedTotalMs = 0
        for (let i = 2; i < normalizedTimes.length; i += 2) {
            nsiClosedTotalMs += normalizedTimes[i] - normalizedTimes[i - 1]
        }

        const denomPeriods = Math.max(1, normalizedTimes.length / 2 - 1)
        const avgPeriodMs = (nsiOpenTotalMs + nsiClosedTotalMs) / denomPeriods
        const fHz = avgPeriodMs > 0 ? 1000 / avgPeriodMs : 0

        const dutyClosed =
            nsiClosedTotalMs + nsiOpenTotalMs > 0
                ? Math.round((nsiClosedTotalMs * 100) / (nsiClosedTotalMs + nsiOpenTotalMs))
                : 0

        /** @type {Array<string>} */
        const warnings = []
        if (fHz < 7 || fHz > 13) warnings.push(WARNING_KEYS.DIAL_SPEED)
        if (dutyClosed < 10 || dutyClosed > 70) warnings.push(WARNING_KEYS.PULSE_PAUSE_RATIO)

        return {
            createdAt: new Date(),
            nnMs: nn,
            nsiTimesMs: normalizedTimes,
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
