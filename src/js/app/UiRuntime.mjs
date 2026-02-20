/**
 * Encapsulates DOM bindings and UI state writes.
 */
export class UiRuntime {
    /** @type {(key: string, params?: Record<string, unknown>) => string} */
    #t

    /** @type {{ dataCarrierDetect: boolean, dataSetReady: boolean, ringIndicator: boolean }|null} */
    #pendingSignalValues = null

    /** @type {number|null} */
    #signalFrameRequest = null

    /** @type {{ nsi: boolean|null, nsr: boolean|null, nsa: boolean|null }} */
    #ledSignalState = { nsi: null, nsr: null, nsa: null }

    /**
     * @param {object} options
     * @param {(key: string, params?: Record<string, unknown>) => string} options.translate
     */
    constructor({ translate }) {
        this.#t = translate

        const $ = (selector) => document.querySelector(selector)

        /** @type {Record<string, HTMLElement|HTMLButtonElement|HTMLSelectElement|HTMLInputElement|HTMLCanvasElement|HTMLDialogElement>} */
        this.dom = {
            btnConnect: /** @type {HTMLButtonElement} */ ($('#btnConnect')),
            btnDisconnect: /** @type {HTMLButtonElement} */ ($('#btnDisconnect')),
            btnStart: /** @type {HTMLButtonElement} */ ($('#btnStart')),
            btnIdeal: /** @type {HTMLButtonElement} */ ($('#btnIdeal')),
            btnClear: /** @type {HTMLButtonElement} */ ($('#btnClear')),
            btnPrint: /** @type {HTMLButtonElement} */ ($('#btnPrint')),
            btnSavePng: /** @type {HTMLButtonElement} */ ($('#btnSavePng')),
            btnSaveJpg: /** @type {HTMLButtonElement} */ ($('#btnSaveJpg')),
            btnHelp: /** @type {HTMLButtonElement} */ ($('#btnHelp')),
            btnCloseHelp: /** @type {HTMLButtonElement} */ ($('#btnCloseHelp')),
            dlgHelp: /** @type {HTMLDialogElement} */ ($('#dlgHelp')),
            btnRunTime: /** @type {HTMLButtonElement} */ ($('#btnRunTime')),
            btnSpread: /** @type {HTMLButtonElement} */ ($('#btnSpread')),
            analysisCard: /** @type {HTMLElement} */ ($('#analysisCard')),
            analysisTitle: /** @type {HTMLElement} */ ($('#analysisTitle')),
            analysisCanvas: /** @type {HTMLCanvasElement} */ ($('#analysisCanvas')),
            analysisTableWrap: /** @type {HTMLElement} */ ($('#analysisTableWrap')),
            portInfo: /** @type {HTMLElement} */ ($('#portInfo')),
            warnBox: /** @type {HTMLElement} */ ($('#warnBox')),
            ledNsi: /** @type {HTMLElement} */ ($('#ledNsi')),
            ledNsr: /** @type {HTMLElement} */ ($('#ledNsr')),
            ledNsa: /** @type {HTMLElement} */ ($('#ledNsa')),
            valDigit: /** @type {HTMLElement} */ ($('#valDigit')),
            valPulses: /** @type {HTMLElement} */ ($('#valPulses')),
            valDiagram: /** @type {HTMLElement} */ ($('#valDiagram')),
            valHz: /** @type {HTMLElement} */ ($('#valHz')),
            gaugeHz: /** @type {HTMLInputElement} */ ($('#gaugeHz')),
            valDuty: /** @type {HTMLElement} */ ($('#valDuty')),
            gaugeDuty: /** @type {HTMLInputElement} */ ($('#gaugeDuty')),
            selDebounce: /** @type {HTMLSelectElement} */ ($('#selDebounce')),
            chkDtmf: /** @type {HTMLInputElement} */ ($('#chkDtmf')),
            selLocale: /** @type {HTMLSelectElement} */ ($('#selLocale')),
            diagramStrip: /** @type {HTMLElement} */ ($('#diagramStrip')),
            diagramPlaceholder: /** @type {HTMLElement} */ ($('#diagramPlaceholder')),
            pulseDots: /** @type {HTMLElement} */ ($('#pulseDots'))
        }

        this.#initializePulseDots()
    }

    /**
     * Initializes ten pulse indicator dots.
     * @returns {void}
     */
    #initializePulseDots() {
        this.dom.pulseDots.innerHTML = ''

        for (let index = 1; index <= 10; index += 1) {
            const dot = document.createElement('span')
            dot.className = 'pulse-dot'
            this.dom.pulseDots.appendChild(dot)
        }
    }

    /**
     * Reads last-selected locale from localStorage.
     * @returns {string|null}
     */
    loadStoredLocale() {
        try {
            return localStorage.getItem('locale')
        } catch {
            return null
        }
    }

    /**
     * Persists selected locale in localStorage.
     * @param {string} locale
     * @returns {void}
     */
    saveStoredLocale(locale) {
        try {
            localStorage.setItem('locale', locale)
        } catch {}
    }

    /**
     * Updates runtime-aware Start/Stop label.
     * @param {boolean} running
     * @returns {void}
     */
    updateStartButtonLabel(running) {
        this.dom.btnStart.textContent = this.#t(running ? 'controls.stop' : 'controls.start')
    }

    /**
     * Updates localized pulse-dot tooltips.
     * @returns {void}
     */
    updatePulseDotTitles() {
        const dots = [...this.dom.pulseDots.children]
        dots.forEach((dot, index) => {
            dot.title = this.#t('pulseStrip.dotTitle', { count: index + 1 })
        })
    }

    /**
     * Updates analysis title text for current mode.
     * @param {'runtime'|'spread'|null} mode
     * @returns {void}
     */
    refreshAnalysisTitle(mode) {
        if (mode === 'runtime') {
            this.dom.analysisTitle.textContent = this.#t('analysis.runtimeTitle')
            return
        }

        if (mode === 'spread') {
            this.dom.analysisTitle.textContent = this.#t('analysis.spreadTitle')
            return
        }

        this.dom.analysisTitle.textContent = this.#t('analysis.title')
    }

    /**
     * Shows or hides warning text with an optional support link.
     * @param {string} message
     * @param {{ href: string, label: string }|null} [link]
     * @returns {void}
     */
    setWarn(message, link = null) {
        if (!message) {
            this.dom.warnBox.hidden = true
            this.dom.warnBox.textContent = ''
            return
        }

        this.dom.warnBox.hidden = false
        this.dom.warnBox.textContent = message

        if (!link) return

        const anchor = document.createElement('a')
        anchor.href = link.href
        anchor.target = '_blank'
        anchor.rel = 'noreferrer'
        anchor.textContent = link.label
        this.dom.warnBox.append(document.createTextNode(' '))
        this.dom.warnBox.appendChild(anchor)
    }

    /**
     * Applies one LED boolean value.
     * @param {HTMLElement} element
     * @param {boolean} on
     * @returns {void}
     */
    #setLed(element, on) {
        element.classList.toggle('on', !!on)
        element.classList.toggle('off', !on)
    }

    /**
     * Applies raw modem signal values and only updates changed LEDs.
     * @param {{ dataCarrierDetect: boolean, dataSetReady: boolean, ringIndicator: boolean }} values
     * @returns {void}
     */
    #applySignalValues(values) {
        if (this.#ledSignalState.nsi !== values.dataCarrierDetect) {
            this.#ledSignalState.nsi = values.dataCarrierDetect
            this.#setLed(this.dom.ledNsi, values.dataCarrierDetect)
        }

        if (this.#ledSignalState.nsr !== values.dataSetReady) {
            this.#ledSignalState.nsr = values.dataSetReady
            this.#setLed(this.dom.ledNsr, values.dataSetReady)
        }

        if (this.#ledSignalState.nsa !== values.ringIndicator) {
            this.#ledSignalState.nsa = values.ringIndicator
            this.#setLed(this.dom.ledNsa, values.ringIndicator)
        }
    }

    /**
     * Flushes pending LED writes in one frame callback.
     * @returns {void}
     */
    #flushSignalFrame() {
        this.#signalFrameRequest = null
        if (!this.#pendingSignalValues) return

        const values = this.#pendingSignalValues
        this.#pendingSignalValues = null
        this.#applySignalValues(values)
    }

    /**
     * Queues modem LED updates in requestAnimationFrame.
     * @param {{ dataCarrierDetect: boolean, dataSetReady: boolean, ringIndicator: boolean }} values
     * @returns {void}
     */
    queueSignalUpdate(values) {
        this.#pendingSignalValues = {
            dataCarrierDetect: !!values.dataCarrierDetect,
            dataSetReady: !!values.dataSetReady,
            ringIndicator: !!values.ringIndicator
        }

        if (this.#signalFrameRequest !== null) return
        this.#signalFrameRequest = requestAnimationFrame(() => {
            this.#flushSignalFrame()
        })
    }

    /**
     * Resets LED indicators and pending signal frame state.
     * @returns {void}
     */
    resetSignalIndicators() {
        this.#pendingSignalValues = null

        if (this.#signalFrameRequest !== null) {
            cancelAnimationFrame(this.#signalFrameRequest)
            this.#signalFrameRequest = null
        }

        this.#ledSignalState.nsi = null
        this.#ledSignalState.nsr = null
        this.#ledSignalState.nsa = null

        this.#setLed(this.dom.ledNsi, false)
        this.#setLed(this.dom.ledNsr, false)
        this.#setLed(this.dom.ledNsa, false)
    }

    /**
     * Clears pulse strip state classes.
     * @returns {void}
     */
    resetPulseDots() {
        const dots = [...this.dom.pulseDots.children]
        dots.forEach((dot) => dot.classList.remove('on', 'bad'))
    }

    /**
     * Updates pulse strip state for measured pulse count.
     * @param {number} pulses
     * @returns {void}
     */
    updatePulseDots(pulses) {
        this.resetPulseDots()
        const dots = [...this.dom.pulseDots.children]

        for (let index = 0; index < Math.min(pulses, 10); index += 1) {
            dots[index].classList.add('on')
        }

        if (pulses > 10) {
            dots.forEach((dot) => dot.classList.add('bad'))
        }
    }

    /**
     * Applies one completed cycle to numeric UI fields.
     * @param {object} cycle
     * @returns {void}
     */
    applyCycleValues(cycle) {
        this.dom.valDigit.textContent = String(cycle.digit)
        this.dom.valPulses.textContent = String(cycle.pulses)
        this.dom.valHz.textContent = cycle.fHz.toFixed(1)
        this.dom.gaugeHz.value = String(Math.max(7, Math.min(13, cycle.fHz)))
        this.dom.valDuty.textContent = String(cycle.dutyClosed)
        this.dom.gaugeDuty.value = String(Math.max(10, Math.min(70, cycle.dutyClosed)))
        this.updatePulseDots(cycle.pulses)
    }

    /**
     * Resets cycle-related numeric displays to defaults.
     * @returns {void}
     */
    resetCycleValues() {
        this.dom.valDigit.textContent = '-'
        this.dom.valPulses.textContent = '0'
        this.dom.valHz.textContent = '0.0'
        this.dom.gaugeHz.value = '7'
        this.dom.valDuty.textContent = '0'
        this.dom.gaugeDuty.value = '10'
        this.resetPulseDots()
    }

    /**
     * Updates diagram progress counter text.
     * @param {number} count
     * @returns {void}
     */
    setDiagramCount(count) {
        this.dom.valDiagram.textContent = `${count}/10`
    }

    /**
     * Updates button disabled states based on app state.
     * @param {object} state
     * @param {boolean} state.connected
     * @param {number} state.diagramCount
     * @param {boolean} state.analysisReady
     * @returns {void}
     */
    updateButtons({ connected, diagramCount, analysisReady }) {
        this.dom.btnDisconnect.disabled = !connected
        this.dom.btnStart.disabled = !connected
        this.dom.selDebounce.disabled = !connected
        this.dom.chkDtmf.disabled = !connected
        this.dom.btnIdeal.disabled = !connected
        this.dom.btnClear.disabled = !connected
        this.dom.btnPrint.disabled = !connected || diagramCount === 0
        this.dom.btnSavePng.disabled = !connected || diagramCount === 0
        this.dom.btnSaveJpg.disabled = !connected || diagramCount === 0
        this.dom.btnRunTime.disabled = !analysisReady
        this.dom.btnSpread.disabled = !analysisReady
    }

    /**
     * Updates port info label text.
     * @param {string} label
     * @returns {void}
     */
    setPortLabel(label) {
        this.dom.portInfo.textContent = label
    }

    /**
     * Shows or hides diagram placeholder card text.
     * @param {boolean} visible
     * @returns {void}
     */
    setDiagramPlaceholderVisible(visible) {
        this.dom.diagramPlaceholder.hidden = !visible
    }

    /**
     * Sets analysis card visibility.
     * @param {boolean} visible
     * @returns {void}
     */
    setAnalysisVisible(visible) {
        this.dom.analysisCard.hidden = !visible
    }

    /**
     * Clears analysis table content.
     * @returns {void}
     */
    clearAnalysisTable() {
        this.dom.analysisTableWrap.innerHTML = ''
    }

    /**
     * Writes analysis table HTML.
     * @param {string} html
     * @returns {void}
     */
    setAnalysisTableHtml(html) {
        this.dom.analysisTableWrap.innerHTML = html
    }

    /**
     * Returns currently selected debounce value.
     * @returns {number}
     */
    getDebounceMs() {
        return Number(this.dom.selDebounce.value)
    }

    /**
     * Returns whether DTMF playback is enabled.
     * @returns {boolean}
     */
    isDtmfEnabled() {
        return this.dom.chkDtmf.checked
    }

    /**
     * Updates DTMF checkbox state.
     * @param {boolean} enabled
     * @returns {void}
     */
    setDtmfEnabled(enabled) {
        this.dom.chkDtmf.checked = !!enabled
    }

    /**
     * Returns currently selected locale code.
     * @returns {string}
     */
    getLocale() {
        return String(this.dom.selLocale?.value || 'en')
    }

    /**
     * Sets selected locale in the dropdown.
     * @param {string} locale
     * @returns {void}
     */
    setLocale(locale) {
        if (!this.dom.selLocale) return
        this.dom.selLocale.value = locale
    }

    /**
     * Toggles Start button visual state and localized label.
     * @param {boolean} running
     * @returns {void}
     */
    setStartRunningState(running) {
        this.dom.btnStart.classList.toggle('on', !!running)
        this.updateStartButtonLabel(running)
    }
}
