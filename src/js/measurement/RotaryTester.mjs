import { t } from '../i18n.mjs'
import { RotaryCycleEngine } from './RotaryCycleEngine.mjs'
import { sleep } from '../utils/sleep.mjs'

/**
 * Main-thread adapter around RotaryCycleEngine that polls WebSerial modem signals.
 */
export class RotaryTester {
    /**
     * @param {object} deps
     * @param {import('../serial/SerialManager.mjs').SerialManager} deps.serial
     * @param {(signals: object) => void} deps.onSignals
     * @param {(cycle: object) => void} deps.onCycle
     * @param {(msg: string) => void} deps.onWarn
     */
    constructor({ serial, onSignals, onCycle, onWarn }) {
        this.serial = serial
        this.onSignals = onSignals
        this.onCycle = onCycle
        this.onWarn = onWarn

        /**
         * Poll interval in milliseconds.
         * @type {number}
         */
        this.pollIntervalMs = 1

        /**
         * Whether the async poll loop is active.
         * @type {boolean}
         */
        this.running = false

        /**
         * Shared cycle computation engine.
         * @type {RotaryCycleEngine}
         */
        this.engine = new RotaryCycleEngine({ nowMs: () => this._nowMs() })
    }

    /**
     * Sets debounce delay in milliseconds.
     * @param {number} ms
     * @returns {void}
     */
    setDebounceMs(ms) {
        this.engine.setDebounceMs(ms)
    }

    /**
     * Returns a monotonic timestamp in milliseconds.
     * @returns {number}
     */
    _nowMs() {
        return performance.now()
    }

    /**
     * Resets all tracking state.
     * @returns {void}
     */
    _resetAll() {
        this.engine.resetAll()
    }

    /**
     * Resets the currently captured cycle.
     * @returns {void}
     */
    _resetCycle() {
        this.engine.resetCycle()
    }

    /**
     * Starts polling serial signals.
     * @returns {Promise<void>}
     */
    async start() {
        if (this.running) return
        if (!this.serial.isOpen) throw new Error(t('errors.portNotConnected'))

        const signals = await this.serial.getSignals()
        const initResult = this.engine.initializeFromSignals(signals)
        if (initResult.warningKey) {
            this.onWarn?.(t(initResult.warningKey))
        }

        this.running = true
        this._loop().catch((err) => {
            console.error(err)
            this.onWarn?.(String(err?.message || err))
            this.running = false
        })
    }

    /**
     * Stops polling serial signals.
     * @returns {void}
     */
    stop() {
        this.running = false
    }

    /**
     * Polls signal lines and forwards computed cycles.
     * @returns {Promise<void>}
     */
    async _loop() {
        while (this.running) {
            const signals = await this.serial.getSignals()
            this.onSignals?.(signals)

            let stableDcd = !!signals.dataCarrierDetect
            if (this.debounceMs > 0) {
                await sleep(this.debounceMs)
                const confirm = await this.serial.getSignals()
                const confirmDcd = !!confirm.dataCarrierDetect
                if (stableDcd !== confirmDcd) {
                    await sleep(this.pollIntervalMs)
                    continue
                }
                stableDcd = confirmDcd
            }

            const { cycle } = this.engine.processStableSignals({
                dataCarrierDetect: stableDcd,
                dataSetReady: !!signals.dataSetReady,
                ringIndicator: !!signals.ringIndicator
            })

            if (cycle) {
                this.onCycle?.({
                    ...cycle,
                    warnings: cycle.warnings.map((warningKey) => t(warningKey))
                })
            }

            await sleep(this.pollIntervalMs)
        }
    }

    /**
     * Handles one nsa signal transition.
     * @param {boolean} newState
     * @returns {void}
     */
    _handleNsa(newState) {
        this.engine.processStableSignals({
            dataCarrierDetect: this.nsiState ?? true,
            dataSetReady: this.nsrState ?? false,
            ringIndicator: newState
        })
    }

    /**
     * Handles one nsr signal transition.
     * @param {boolean} newState
     * @returns {void}
     */
    _handleNsr(newState) {
        this.engine.processStableSignals({
            dataCarrierDetect: this.nsiState ?? true,
            dataSetReady: newState,
            ringIndicator: this.nsaState ?? false
        })
    }

    /**
     * Handles one nsi signal transition.
     * @param {boolean} newState
     * @returns {void}
     */
    _handleNsi(newState) {
        this.engine.processStableSignals({
            dataCarrierDetect: newState,
            dataSetReady: this.nsrState ?? false,
            ringIndicator: this.nsaState ?? false
        })
    }

    /**
     * Evaluates whether a full dial cycle can be emitted.
     * @returns {void}
     */
    _maybeFinalize() {
        // Finalization is triggered by processStableSignals in the shared engine.
    }

    /**
     * Computes cycle metrics from captured timestamps.
     * @returns {object|null}
     */
    _computeCycle() {
        const cycle = this.engine.computeCycle()
        if (!cycle) return null
        return {
            ...cycle,
            warnings: cycle.warnings.map((warningKey) => t(warningKey))
        }
    }

    /**
     * Returns current debounce in milliseconds.
     * @returns {number}
     */
    get debounceMs() {
        return this.engine.debounceMs
    }

    /**
     * Returns current nsi transition timestamps.
     * @returns {Array<number>}
     */
    get nsiTimes() {
        return this.engine.nsiTimes
    }

    /**
     * Sets nsi transition timestamps.
     * @param {Array<number>} value
     * @returns {void}
     */
    set nsiTimes(value) {
        this.engine.nsiTimes = Array.isArray(value) ? value : []
    }

    /**
     * Returns current nsa transition timestamps.
     * @returns {Array<number>}
     */
    get nsaTimes() {
        return this.engine.nsaTimes
    }

    /**
     * Sets nsa transition timestamps.
     * @param {Array<number>} value
     * @returns {void}
     */
    set nsaTimes(value) {
        this.engine.nsaTimes = Array.isArray(value) ? value : []
    }

    /**
     * Returns current nsr transition timestamps.
     * @returns {Array<number>}
     */
    get nsrTimes() {
        return this.engine.nsrTimes
    }

    /**
     * Sets nsr transition timestamps.
     * @param {Array<number>} value
     * @returns {void}
     */
    set nsrTimes(value) {
        this.engine.nsrTimes = Array.isArray(value) ? value : []
    }

    /**
     * Returns current nsi level.
     * @returns {boolean|null}
     */
    get nsiState() {
        return this.engine.nsiState
    }

    /**
     * Sets current nsi level.
     * @param {boolean|null} value
     * @returns {void}
     */
    set nsiState(value) {
        this.engine.nsiState = typeof value === 'boolean' ? value : value === null ? null : !!value
    }

    /**
     * Returns current nsa level.
     * @returns {boolean|null}
     */
    get nsaState() {
        return this.engine.nsaState
    }

    /**
     * Sets current nsa level.
     * @param {boolean|null} value
     * @returns {void}
     */
    set nsaState(value) {
        this.engine.nsaState = typeof value === 'boolean' ? value : value === null ? null : !!value
    }

    /**
     * Returns current nsr level.
     * @returns {boolean|null}
     */
    get nsrState() {
        return this.engine.nsrState
    }

    /**
     * Sets current nsr level.
     * @param {boolean|null} value
     * @returns {void}
     */
    set nsrState(value) {
        this.engine.nsrState = typeof value === 'boolean' ? value : value === null ? null : !!value
    }

    /**
     * Returns whether a cycle has already been emitted.
     * @returns {boolean}
     */
    get hasEvaluatedCycle() {
        return this.engine.hasEvaluatedCycle
    }

    /**
     * Sets whether the current cycle has been emitted.
     * @param {boolean} value
     * @returns {void}
     */
    set hasEvaluatedCycle(value) {
        this.engine.hasEvaluatedCycle = !!value
    }

    /**
     * Returns whether nsa is currently missing for this cycle.
     * @returns {boolean}
     */
    get nsaMissing() {
        return this.engine.nsaMissing
    }

    /**
     * Sets nsa missing flag.
     * @param {boolean} value
     * @returns {void}
     */
    set nsaMissing(value) {
        this.engine.nsaMissing = !!value
    }
}
