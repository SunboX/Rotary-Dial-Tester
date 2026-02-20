/**
 * Centralized command layer used by both UI events and WebMCP tools.
 */
export class AppController {
    /** @type {Record<string, Function>} */
    #actions

    /**
     * @param {Record<string, Function>} actions
     */
    constructor(actions) {
        this.#actions = actions || {}
    }

    /**
     * Connects the COM port and initializes the tester flow.
     * @param {{ preferKnown?: boolean }} [options]
     * @returns {Promise<object>}
     */
    async connectCom(options = {}) {
        return await this.#invokeAsync('connectCom', options)
    }

    /**
     * Disconnects the COM port and stops active measurement loops.
     * @returns {Promise<object>}
     */
    async disconnectCom() {
        return await this.#invokeAsync('disconnectCom')
    }

    /**
     * Starts the measurement loop.
     * @returns {Promise<object>}
     */
    async startTest() {
        return await this.#invokeAsync('startTest')
    }

    /**
     * Stops the measurement loop.
     * @returns {object}
     */
    stopTest() {
        return this.#invokeSync('stopTest')
    }

    /**
     * Updates debounce timing for DCD sampling.
     * @param {number} debounceMs
     * @returns {object}
     */
    setDebounce(debounceMs) {
        return this.#invokeSync('setDebounce', debounceMs)
    }

    /**
     * Enables or disables DTMF feedback tones.
     * @param {boolean} enabled
     * @returns {object}
     */
    setDtmfEnabled(enabled) {
        return this.#invokeSync('setDtmfEnabled', enabled)
    }

    /**
     * Adds ideal reference diagrams.
     * @param {number} [count=10]
     * @returns {object}
     */
    addIdealDiagrams(count = 10) {
        return this.#invokeSync('addIdealDiagrams', count)
    }

    /**
     * Clears all captured diagrams and resets measurement visuals.
     * @returns {object}
     */
    clearDiagrams() {
        return this.#invokeSync('clearDiagrams')
    }

    /**
     * Shows one of the analysis views.
     * @param {'runtime'|'spread'} mode
     * @returns {object}
     */
    showAnalysis(mode) {
        return this.#invokeSync('showAnalysis', mode)
    }

    /**
     * Exports the current diagram strip.
     * @param {'png'|'jpg'|'print'} format
     * @returns {Promise<object>}
     */
    async exportStrip(format) {
        return await this.#invokeAsync('exportStrip', format)
    }

    /**
     * Downloads a single diagram as PNG.
     * @param {number} index
     * @returns {Promise<object>}
     */
    async downloadDiagram(index) {
        return await this.#invokeAsync('downloadDiagram', index)
    }

    /**
     * Applies and persists the selected locale.
     * @param {string} locale
     * @returns {object}
     */
    setLocale(locale) {
        return this.#invokeSync('setLocale', locale)
    }

    /**
     * Opens the help dialog.
     * @returns {object}
     */
    openHelp() {
        return this.#invokeSync('openHelp')
    }

    /**
     * Closes the help dialog.
     * @returns {object}
     */
    closeHelp() {
        return this.#invokeSync('closeHelp')
    }

    /**
     * Returns a normalized snapshot of the current UI/runtime state.
     * @returns {object}
     */
    getState() {
        return this.#invokeSync('getState')
    }

    /**
     * Returns captured measurement cycles.
     * @returns {Array<object>}
     */
    getCycles() {
        return this.#invokeSync('getCycles')
    }

    /**
     * Returns analysis readiness and summary values.
     * @returns {object}
     */
    getAnalysisSnapshot() {
        return this.#invokeSync('getAnalysisSnapshot')
    }

    /**
     * Invokes an asynchronous action by name.
     * @param {string} actionName
     * @param {...unknown} args
     * @returns {Promise<any>}
     */
    async #invokeAsync(actionName, ...args) {
        const action = this.#getAction(actionName)
        return await action(...args)
    }

    /**
     * Invokes a synchronous action by name.
     * @param {string} actionName
     * @param {...unknown} args
     * @returns {any}
     */
    #invokeSync(actionName, ...args) {
        const action = this.#getAction(actionName)
        return action(...args)
    }

    /**
     * Resolves an action callback and validates that it exists.
     * @param {string} actionName
     * @returns {Function}
     */
    #getAction(actionName) {
        const action = this.#actions[actionName]
        if (typeof action !== 'function') {
            throw new Error(`Missing AppController action: ${actionName}`)
        }
        return action
    }
}
