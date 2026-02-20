import { RotaryTester } from '../measurement/RotaryTester.mjs'
import { drawRunTimeScatter } from '../render/analysis.mjs'
import { drawImpulseDiagram } from '../render/impulseDiagram.mjs'
import { WEB_SERIAL_MISSING_CODE, WEB_SERIAL_USER_ACTION_REQUIRED_CODE } from '../serial/SerialManager.mjs'
import { scheduleIdle } from '../utils/idle.mjs'
import { ExportWorkerClient } from '../workers/ExportWorkerClient.mjs'
import { MeasurementWorkerClient } from '../workers/MeasurementWorkerClient.mjs'
import { RenderWorkerClient } from '../workers/RenderWorkerClient.mjs'

/**
 * Bridges measurement/render/export runtimes and chooses worker vs fallback paths.
 */
export class RuntimeBridge {
    /** @type {import('../serial/SerialManager.mjs').SerialManager} */
    #serial

    /** @type {(key: string, params?: Record<string, unknown>) => string} */
    #t

    /** @type {(payload: object) => Promise<void>|void} */
    #onCycle

    /** @type {(signals: { dataCarrierDetect: boolean, dataSetReady: boolean, ringIndicator: boolean }) => void} */
    #onSignals

    /** @type {(message: string) => void} */
    #onWarn

    /** @type {(error: unknown) => void} */
    #onError

    /** @type {(running: boolean) => void} */
    #onRunningChanged

    /** @type {(info: { usbVendorId?: number|null, usbProductId?: number|null }|null) => void} */
    #onConnectedChanged

    /** @type {() => number} */
    #getDebounceMs

    /** @type {() => string} */
    #getLocale

    /** @type {RotaryTester|null} */
    #tester = null

    /** @type {MeasurementWorkerClient|null} */
    #measurementWorker = null

    /** @type {RenderWorkerClient|null} */
    #renderWorker = null

    /** @type {ExportWorkerClient|null} */
    #exportWorker = null

    /** @type {'none'|'fallback'|'worker'} */
    #measurementMode = 'none'

    /** @type {'main'|'worker'} */
    #renderMode = 'main'

    /** @type {{ usbVendorId?: number|null, usbProductId?: number|null }|null} */
    #workerPortInfo = null

    /** @type {Set<string>} */
    #renderAttachedDiagramIds = new Set()

    /** @type {WeakMap<HTMLCanvasElement, () => void>} */
    #pendingIdleDiagramDraws = new WeakMap()

    /** @type {(() => void)|null} */
    #cancelRenderWorkerInitIdle = null

    /**
     * @param {object} options
     * @param {import('../serial/SerialManager.mjs').SerialManager} options.serial
     * @param {(key: string, params?: Record<string, unknown>) => string} options.translate
     * @param {(payload: object) => Promise<void>|void} options.onCycle
     * @param {(signals: { dataCarrierDetect: boolean, dataSetReady: boolean, ringIndicator: boolean }) => void} options.onSignals
     * @param {(message: string) => void} options.onWarn
     * @param {(error: unknown) => void} options.onError
     * @param {(running: boolean) => void} options.onRunningChanged
     * @param {(info: { usbVendorId?: number|null, usbProductId?: number|null }|null) => void} options.onConnectedChanged
     * @param {() => number} options.getDebounceMs
     * @param {() => string} options.getLocale
     */
    constructor({
        serial,
        translate,
        onCycle,
        onSignals,
        onWarn,
        onError,
        onRunningChanged,
        onConnectedChanged,
        getDebounceMs,
        getLocale
    }) {
        this.#serial = serial
        this.#t = translate
        this.#onCycle = onCycle
        this.#onSignals = onSignals
        this.#onWarn = onWarn
        this.#onError = onError
        this.#onRunningChanged = onRunningChanged
        this.#onConnectedChanged = onConnectedChanged
        this.#getDebounceMs = getDebounceMs
        this.#getLocale = getLocale
    }

    /**
     * Returns active measurement mode.
     * @returns {'none'|'fallback'|'worker'}
     */
    get measurementMode() {
        return this.#measurementMode
    }

    /**
     * Returns active render mode.
     * @returns {'main'|'worker'}
     */
    get renderMode() {
        return this.#renderMode
    }

    /**
     * Returns last-known worker port info payload.
     * @returns {{ usbVendorId?: number|null, usbProductId?: number|null }|null}
     */
    get workerPortInfo() {
        return this.#workerPortInfo
    }

    /**
     * Returns whether current measurement runtime is connected.
     * @returns {boolean}
     */
    isConnected() {
        if (this.#measurementMode === 'worker') {
            return !!this.#measurementWorker?.connected
        }
        if (this.#measurementMode === 'fallback') {
            return this.#serial.isOpen
        }
        return false
    }

    /**
     * Returns whether current measurement runtime is running.
     * @returns {boolean}
     */
    isRunning() {
        if (this.#measurementMode === 'worker') {
            return !!this.#measurementWorker?.running
        }
        if (this.#measurementMode === 'fallback') {
            return !!this.#tester?.running
        }
        return false
    }

    /**
     * Initializes render-worker path lazily after first paint and idle time.
     * @param {HTMLCanvasElement} analysisCanvas
     * @param {() => void} onReady
     * @returns {void}
     */
    scheduleRenderWorkerInit(analysisCanvas, onReady) {
        if (this.#cancelRenderWorkerInitIdle) {
            this.#cancelRenderWorkerInitIdle()
            this.#cancelRenderWorkerInitIdle = null
        }

        const enqueueAfterPaint =
            typeof requestAnimationFrame === 'function'
                ? requestAnimationFrame
                : (callback) => {
                      setTimeout(callback, 0)
                  }

        enqueueAfterPaint(() => {
            this.#cancelRenderWorkerInitIdle = scheduleIdle(
                () => {
                    this.#cancelRenderWorkerInitIdle = null
                    void this.initRenderWorkerIfSupported(analysisCanvas, onReady)
                },
                { timeout: 500 }
            )
        })
    }

    /**
     * Initializes render-worker mode when supported by runtime APIs.
     * @param {HTMLCanvasElement} analysisCanvas
     * @param {() => void} onReady
     * @returns {Promise<void>}
     */
    async initRenderWorkerIfSupported(analysisCanvas, onReady) {
        if (!RenderWorkerClient.isSupported()) {
            this.#renderMode = 'main'
            return
        }

        try {
            this.#renderWorker = new RenderWorkerClient({
                onError: (payload) => {
                    if (payload?.message) {
                        this.#onError(String(payload.message))
                    }
                }
            })

            await this.#renderWorker.attachAnalysisCanvas(analysisCanvas)
            await this.#renderWorker.setLocale(this.#getLocale())
            this.#renderMode = 'worker'
            onReady()
        } catch (error) {
            this.#onError(error)
            this.#renderMode = 'main'

            if (this.#renderWorker) {
                await this.#renderWorker.dispose().catch(() => {})
                this.#renderWorker = null
            }
        }
    }

    /**
     * Applies locale to render worker when worker mode is active.
     * @param {string} locale
     * @returns {Promise<void>}
     */
    async setRenderLocale(locale) {
        if (this.#renderMode !== 'worker' || !this.#renderWorker) return
        await this.#renderWorker.setLocale(locale)
    }

    /**
     * Attempts worker-first connect and falls back to main-thread runtime on supported failures.
     * @returns {Promise<void>}
     */
    async connect() {
        if (this.isConnected()) return

        const connectedWithWorker = await this.#tryConnectWithMeasurementWorker()
        if (connectedWithWorker) return

        await this.#connectWithFallbackRuntime()
    }

    /**
     * Disconnects and clears active measurement runtime state.
     * @returns {Promise<void>}
     */
    async disconnect() {
        this.stopMeasurement()

        if (this.#measurementMode === 'worker') {
            await this.#measurementWorker?.disconnect()
            this.#measurementMode = 'none'
            this.#workerPortInfo = null
        }

        if (this.#measurementMode === 'fallback' || this.#serial.isOpen) {
            await this.#serial.disconnect()
            this.#tester = null
            this.#measurementMode = 'none'
        }

        this.#onConnectedChanged(null)
        this.#onRunningChanged(false)
    }

    /**
     * Starts measurement in currently active runtime.
     * @returns {Promise<void>}
     */
    async startMeasurement() {
        if (!this.isConnected()) {
            throw new Error(this.#t('errors.portNotConnected'))
        }

        const debounceMs = this.#getDebounceMs()

        if (this.#measurementMode === 'worker') {
            if (!this.#measurementWorker) {
                throw new Error(this.#t('errors.portNotConnected'))
            }

            await this.#measurementWorker.setDebounce(debounceMs)
            await this.#measurementWorker.start()
            this.#onRunningChanged(!!this.#measurementWorker.running)
            return
        }

        if (!this.#tester) {
            throw new Error(this.#t('errors.portNotConnected'))
        }

        if (this.#tester.running) return
        this.#tester.setDebounceMs(debounceMs)
        await this.#tester.start()
        this.#onRunningChanged(!!this.#tester.running)
    }

    /**
     * Stops measurement in currently active runtime.
     * @returns {void}
     */
    stopMeasurement() {
        if (this.#measurementMode === 'worker') {
            void this.#measurementWorker?.stop().catch((error) => {
                this.#onError(error)
            })
            this.#onRunningChanged(false)
            return
        }

        this.#tester?.stop()
        this.#onRunningChanged(false)
    }

    /**
     * Updates debounce value in whichever runtime is active.
     * @param {number} debounceMs
     * @returns {void}
     */
    setDebounce(debounceMs) {
        const clamped = Math.max(0, Math.min(10, Number(debounceMs) || 0))
        if (this.#measurementMode === 'worker') {
            void this.#measurementWorker?.setDebounce(clamped).catch((error) => {
                this.#onError(error)
            })
            return
        }

        this.#tester?.setDebounceMs(clamped)
    }

    /**
     * Draws one diagram through render worker or main-thread fallback.
     * @param {string} diagramId
     * @param {HTMLCanvasElement} canvas
     * @param {object} cycle
     * @param {boolean} ideal
     * @returns {void}
     */
    drawDiagram(diagramId, canvas, cycle, ideal) {
        this.#cancelPendingIdleDiagramDraw(canvas)

        if (this.#renderMode === 'worker' && this.#renderWorker) {
            void (async () => {
                if (!this.#renderAttachedDiagramIds.has(diagramId)) {
                    await this.#renderWorker.attachDiagramCanvas(diagramId, canvas)
                    this.#renderAttachedDiagramIds.add(diagramId)
                }
                await this.#renderWorker.drawDiagram(diagramId, cycle, ideal)
            })().catch((error) => {
                this.#onError(error)
            })
            return
        }

        if (ideal) {
            const cancelIdleDraw = scheduleIdle(
                () => {
                    this.#pendingIdleDiagramDraws.delete(canvas)
                    if (!canvas.isConnected) return
                    drawImpulseDiagram(canvas, cycle, { ideal })
                },
                { timeout: 120 }
            )
            this.#pendingIdleDiagramDraws.set(canvas, cancelIdleDraw)
            return
        }

        drawImpulseDiagram(canvas, cycle, { ideal })
    }

    /**
     * Detaches one diagram canvas from active render runtime.
     * @param {string} diagramId
     * @param {HTMLCanvasElement} canvas
     * @returns {void}
     */
    detachDiagramCanvas(diagramId, canvas) {
        this.#cancelPendingIdleDiagramDraw(canvas)

        if (this.#renderMode === 'worker' && this.#renderWorker && this.#renderAttachedDiagramIds.has(diagramId)) {
            this.#renderAttachedDiagramIds.delete(diagramId)
            void this.#renderWorker.detachDiagramCanvas(diagramId).catch((error) => {
                this.#onError(error)
            })
        }
    }

    /**
     * Clears all tracked render-worker diagram attachments.
     * @param {Array<string>} diagramIds
     * @returns {void}
     */
    clearAttachedDiagramCanvases(diagramIds) {
        if (this.#renderMode !== 'worker' || !this.#renderWorker) return

        for (const diagramId of diagramIds) {
            if (!this.#renderAttachedDiagramIds.has(diagramId)) continue
            this.#renderAttachedDiagramIds.delete(diagramId)
            void this.#renderWorker.detachDiagramCanvas(diagramId).catch(() => {})
        }
    }

    /**
     * Draws runtime analysis using worker or main-thread fallback.
     * @param {HTMLCanvasElement} analysisCanvas
     * @param {Array<object>} cycles
     * @returns {Promise<void>}
     */
    async renderRuntimeAnalysis(analysisCanvas, cycles) {
        if (this.#renderMode === 'worker' && this.#renderWorker) {
            await this.#renderWorker.drawRuntime(cycles)
            return
        }

        drawRunTimeScatter(analysisCanvas, cycles)
    }

    /**
     * Computes spread rows using render worker, returning null for main fallback.
     * @param {Array<object>} cycles
     * @returns {Promise<{ pulses: number, rows: Array<object> }|null>}
     */
    async getSpreadRows(cycles) {
        if (this.#renderMode !== 'worker' || !this.#renderWorker) {
            return null
        }

        await this.#renderWorker.clearAnalysis()
        return await this.#renderWorker.getSpreadRows(cycles)
    }

    /**
     * Clears analysis canvas in active render runtime.
     * @param {HTMLCanvasElement} analysisCanvas
     * @returns {Promise<void>}
     */
    async clearAnalysis(analysisCanvas) {
        if (this.#renderMode === 'worker' && this.#renderWorker) {
            await this.#renderWorker.clearAnalysis()
            return
        }

        const ctx = analysisCanvas.getContext('2d')
        ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height)
    }

    /**
     * Exports strip with runtime priority: render-worker -> export-worker -> main-thread canvas.
     * @param {Array<string>} diagramIds
     * @param {Array<HTMLCanvasElement>} canvases
     * @param {'png'|'jpg'|'print'} format
     * @param {(canvases: Array<HTMLCanvasElement>) => HTMLCanvasElement|null} composeStripImage
     * @returns {Promise<{ source: 'blob'|'canvas', blob?: Blob, canvas?: HTMLCanvasElement, diagramCount: number }>}
     */
    async exportStrip(diagramIds, canvases, format, composeStripImage) {
        if (this.#renderMode === 'worker' && this.#renderWorker) {
            const workerFormat = format === 'jpg' ? 'jpg' : 'png'
            const exported = await this.#renderWorker.exportStrip(diagramIds, workerFormat)
            return {
                source: 'blob',
                blob: exported.blob,
                diagramCount: exported.diagramCount
            }
        }

        if (ExportWorkerClient.isSupported()) {
            const worker = this.#getExportWorker()
            if (worker) {
                try {
                    const workerFormat = format === 'jpg' ? 'jpg' : 'png'
                    const exported = await worker.exportStripFromCanvases(canvases, workerFormat)
                    return {
                        source: 'blob',
                        blob: exported.blob,
                        diagramCount: exported.diagramCount
                    }
                } catch (error) {
                    // Fallback remains available, so keep this path non-fatal.
                    console.warn('Export worker strip fallback failed, using main-thread composition.', error)
                }
            }
        }

        const composed = composeStripImage(canvases)
        if (!composed) {
            throw new Error(this.#t('errors.noDiagramsToExport'))
        }

        return {
            source: 'canvas',
            canvas: composed,
            diagramCount: canvases.length
        }
    }

    /**
     * Exports a single diagram with runtime priority: render-worker -> export-worker -> main-thread canvas.
     * @param {string} diagramId
     * @param {HTMLCanvasElement} canvas
     * @returns {Promise<{ source: 'blob'|'canvas', blob?: Blob, canvas?: HTMLCanvasElement }>}
     */
    async exportDiagram(diagramId, canvas) {
        if (this.#renderMode === 'worker' && this.#renderWorker) {
            const exported = await this.#renderWorker.exportDiagram(diagramId, 'png')
            return {
                source: 'blob',
                blob: exported.blob
            }
        }

        if (ExportWorkerClient.isSupported()) {
            const worker = this.#getExportWorker()
            if (worker) {
                try {
                    const exported = await worker.exportSingleCanvas(canvas, 'png')
                    return {
                        source: 'blob',
                        blob: exported.blob
                    }
                } catch (error) {
                    // Fallback remains available, so keep this path non-fatal.
                    console.warn('Export worker single fallback failed, using main-thread export.', error)
                }
            }
        }

        return {
            source: 'canvas',
            canvas
        }
    }

    /**
     * Disposes worker resources and resets mode state.
     * @returns {Promise<void>}
     */
    async dispose() {
        if (this.#measurementWorker) {
            await this.#measurementWorker.dispose().catch(() => {})
            this.#measurementWorker = null
        }

        if (this.#renderWorker) {
            await this.#renderWorker.dispose().catch(() => {})
            this.#renderWorker = null
        }

        if (this.#exportWorker) {
            await this.#exportWorker.dispose().catch(() => {})
            this.#exportWorker = null
        }

        if (this.#cancelRenderWorkerInitIdle) {
            this.#cancelRenderWorkerInitIdle()
            this.#cancelRenderWorkerInitIdle = null
        }
    }

    /**
     * Returns the reusable export worker client instance when creation succeeds.
     * @returns {ExportWorkerClient|null}
     */
    #getExportWorker() {
        if (this.#exportWorker) return this.#exportWorker
        if (!ExportWorkerClient.isSupported()) return null

        try {
            this.#exportWorker = new ExportWorkerClient({
                onError: (payload) => {
                    if (payload?.message) {
                        this.#onError(String(payload.message))
                    }
                }
            })
            return this.#exportWorker
        } catch (error) {
            this.#onError(error)
            this.#exportWorker = null
            return null
        }
    }

    /**
     * Cancels pending idle draw for one diagram canvas.
     * @param {HTMLCanvasElement} canvas
     * @returns {void}
     */
    #cancelPendingIdleDiagramDraw(canvas) {
        const cancel = this.#pendingIdleDiagramDraws.get(canvas)
        if (!cancel) return
        cancel()
        this.#pendingIdleDiagramDraws.delete(canvas)
    }

    /**
     * Creates or returns measurement worker client.
     * @returns {MeasurementWorkerClient|null}
     */
    #getMeasurementWorker() {
        if (this.#measurementWorker) return this.#measurementWorker
        if (!MeasurementWorkerClient.isSupported()) return null

        this.#measurementWorker = new MeasurementWorkerClient({
            onSignals: (payload) => {
                if (payload?.signals) {
                    this.#onSignals(payload.signals)
                }
            },
            onCycle: (payload) => {
                if (!payload?.cycle) return
                void Promise.resolve(this.#onCycle(payload.cycle)).catch((error) => {
                    this.#onError(error)
                })
            },
            onWarning: (payload) => {
                const key = String(payload?.key || '')
                const message = key.startsWith('warnings.') ? this.#t(key) : key
                if (message) {
                    this.#onWarn(message)
                }
            },
            onRunning: (payload) => {
                this.#onRunningChanged(!!payload?.running)
            },
            onConnected: (payload) => {
                this.#workerPortInfo = payload?.info || null
                this.#onConnectedChanged(this.#workerPortInfo)
            },
            onDisconnected: () => {
                this.#workerPortInfo = null
                this.#onConnectedChanged(null)
                this.#onRunningChanged(false)
            },
            onError: (payload) => {
                if (payload?.message) {
                    this.#onError(String(payload.message))
                }
            }
        })

        return this.#measurementWorker
    }

    /**
     * Connects using worker runtime by transferring picker-selected port.
     * @returns {Promise<boolean>}
     */
    async #tryConnectWithMeasurementWorker() {
        if (!MeasurementWorkerClient.isSupported()) return false
        if (!('serial' in navigator)) return false

        const worker = this.#getMeasurementWorker()
        if (!worker) return false

        try {
            // Always show explicit picker to avoid ambiguous auto-selection.
            const selectedPort = await navigator.serial.requestPort()
            await worker.connectPort(selectedPort)
            await worker.setDebounce(this.#getDebounceMs())

            this.#tester = null
            this.#measurementMode = 'worker'
            this.#workerPortInfo = worker.portInfo
            this.#onConnectedChanged(this.#workerPortInfo)
            this.#onRunningChanged(!!worker.running)
            return true
        } catch (error) {
            if (!this.#shouldFallbackFromWorker(error)) {
                throw error
            }

            this.#measurementMode = 'none'
            this.#workerPortInfo = null
            return false
        }
    }

    /**
     * Connects via SerialManager + RotaryTester fallback runtime and auto-starts measurement.
     * @returns {Promise<void>}
     */
    async #connectWithFallbackRuntime() {
        await this.#serial.connect()
        this.#measurementMode = 'fallback'
        this.#workerPortInfo = null

        this.#tester = new RotaryTester({
            serial: this.#serial,
            onSignals: (signals) => {
                this.#onSignals({
                    dataCarrierDetect: !!signals.dataCarrierDetect,
                    dataSetReady: !!signals.dataSetReady,
                    ringIndicator: !!signals.ringIndicator
                })
            },
            onCycle: async (cycle) => {
                await this.#onCycle(cycle)
            },
            onWarn: (message) => {
                this.#onWarn(String(message || ''))
            }
        })

        this.#onConnectedChanged(null)
        await this.startMeasurement()
    }

    /**
     * Returns whether worker runtime errors should trigger fallback mode.
     * @param {unknown} error
     * @returns {boolean}
     */
    #shouldFallbackFromWorker(error) {
        const name = String(error?.name || '')
        const message = String(error?.message || '').toLowerCase()

        if (name === 'NotFoundError' || name === 'AbortError') {
            return false
        }

        if (name === 'DataCloneError') {
            return true
        }

        if (message.includes('not transferable') || message.includes('could not be cloned')) {
            return true
        }

        if (message.includes('workers are not supported')) {
            return true
        }

        return false
    }

    /**
     * Converts serial-connect failures into warning strings and optional help links.
     * @param {unknown} error
     * @returns {{ message: string, link: { href: string, label: string }|null }}
     */
    toConnectWarning(error) {
        const isWebSerialMissing = error?.code === WEB_SERIAL_MISSING_CODE
        const isUserActionRequired = error?.code === WEB_SERIAL_USER_ACTION_REQUIRED_CODE

        let message = String(error?.message || error)
        let link = null

        if (isWebSerialMissing) {
            message = this.#t('errors.webSerialMissing')
            link = {
                href: 'https://caniuse.com/web-serial',
                label: this.#t('errors.webSerialMissingLink')
            }
        }

        if (isUserActionRequired) {
            message = this.#t('errors.webSerialUserActionRequired')
        }

        return { message, link }
    }
}
