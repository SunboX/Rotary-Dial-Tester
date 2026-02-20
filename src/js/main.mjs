import { AppController } from './app/AppController.mjs'
import { DiagramRuntime } from './app/DiagramRuntime.mjs'
import { RuntimeBridge } from './app/RuntimeBridge.mjs'
import { UiRuntime } from './app/UiRuntime.mjs'
import { DtmfPlayer } from './audio/DtmfPlayer.mjs'
import { composeStripImage, downloadBlob, downloadCanvas, printBlob, printCanvas } from './export.mjs'
import { applyTranslations, setLocale, t } from './i18n.mjs'
import { buildImpulseSpreadTable, buildImpulseSpreadTableFromRows } from './render/analysis.mjs'
import { SerialManager } from './serial/SerialManager.mjs'
import { scheduleIdle } from './utils/idle.mjs'
import { initWebMcp } from './webmcp/initWebMcp.mjs'
import { registerServiceWorker } from './pwa/registerServiceWorker.mjs'

const serial = new SerialManager()
const audio = new DtmfPlayer()
const ui = new UiRuntime({ translate: t })
const diagramRuntime = new DiagramRuntime({
    translate: t,
    diagramStrip: ui.dom.diagramStrip,
    diagramPlaceholder: ui.dom.diagramPlaceholder
})

/** @type {AppController|null} */
let controller = null

/** @type {'runtime'|'spread'|null} */
let activeAnalysis = null

/** @type {number} */
let spreadRequestToken = 0

/** @type {(() => void)|null} */
let cancelLocaleRefreshIdle = null

/** @type {number} */
let localeRefreshToken = 0

const runtimeBridge = new RuntimeBridge({
    serial,
    translate: t,
    onCycle: async (cycle) => {
        await handleCycle(cycle)
    },
    onSignals: (signals) => {
        ui.queueSignalUpdate(signals)
    },
    onWarn: (message) => {
        ui.setWarn(String(message || ''))
    },
    onError: (error) => {
        console.error(error)
        ui.setWarn(String(error?.message || error))
    },
    onRunningChanged: (running) => {
        ui.setStartRunningState(running)
        updateButtons()
    },
    onConnectedChanged: () => {
        if (!runtimeBridge.isConnected()) {
            ui.resetSignalIndicators()
        }
        setPortLabel()
        updateButtons()
    },
    getDebounceMs: () => ui.getDebounceMs(),
    getLocale: () => ui.getLocale()
})

/**
 * Resolves warnings that may be plain text or i18n keys.
 * @param {Array<unknown>} warnings
 * @returns {Array<string>}
 */
function resolveWarningMessages(warnings) {
    if (!Array.isArray(warnings)) return []

    return warnings
        .map((warning) => {
            if (typeof warning === 'string' && warning.startsWith('warnings.')) {
                return t(warning)
            }
            return String(warning || '')
        })
        .filter(Boolean)
}

/**
 * Normalizes cycle payloads from worker and fallback runtimes.
 * @param {object} cycle
 * @returns {object}
 */
function normalizeCycle(cycle) {
    return {
        ...cycle,
        createdAt: cycle?.createdAt ? new Date(cycle.createdAt) : new Date(),
        nsiTimesMs: Array.isArray(cycle?.nsiTimesMs) ? [...cycle.nsiTimesMs] : [],
        warnings: resolveWarningMessages(cycle?.warnings || [])
    }
}

/**
 * Handles one completed measurement cycle.
 * @param {object} cycleInput
 * @returns {Promise<void>}
 */
async function handleCycle(cycleInput) {
    const cycle = normalizeCycle(cycleInput)

    if (ui.isDtmfEnabled()) {
        const key = cycle.digit === 0 ? '0' : String(cycle.digit)
        await audio.playKey(key, 200)
    } else {
        await audio.beep(450, 200)
    }

    if (cycle.warnings?.length) {
        ui.setWarn(cycle.warnings.join(' '))
    } else {
        ui.setWarn('')
    }

    ui.applyCycleValues(cycle)
    diagramRuntime.addDiagram(cycle, {
        drawDiagram: (diagramId, canvas, diagramCycle, ideal) => {
            runtimeBridge.drawDiagram(diagramId, canvas, diagramCycle, ideal)
        },
        onBeforeRemove: (diagramId, canvas) => {
            runtimeBridge.detachDiagramCanvas(diagramId, canvas)
        }
    })
    ui.setDiagramCount(diagramRuntime.getDiagramCount())
    updateButtons()
}

/**
 * Returns whether runtime/spread analysis is available.
 * @returns {boolean}
 */
function isAnalysisReady() {
    return diagramRuntime.isAnalysisReady()
}

/**
 * Formats worker-side USB info for port label display.
 * @param {{ usbVendorId?: number|null, usbProductId?: number|null }|null} info
 * @returns {string}
 */
function formatWorkerPortInfo(info) {
    if (!info) return t('port.connected')

    const hasVid = typeof info.usbVendorId === 'number'
    const hasPid = typeof info.usbProductId === 'number'
    if (!hasVid && !hasPid) return t('port.connected')

    const vid = hasVid ? `0x${info.usbVendorId.toString(16).padStart(4, '0')}` : '-'
    const pid = hasPid ? `0x${info.usbProductId.toString(16).padStart(4, '0')}` : '-'
    return `USB VID ${vid} - PID ${pid}`
}

/**
 * Updates connection label based on active runtime.
 * @returns {void}
 */
function setPortLabel() {
    if (runtimeBridge.measurementMode === 'worker' && runtimeBridge.isConnected()) {
        ui.setPortLabel(formatWorkerPortInfo(runtimeBridge.workerPortInfo))
        return
    }

    ui.setPortLabel(serial.getInfoString())
}

/**
 * Updates disabled states for control buttons.
 * @returns {void}
 */
function updateButtons() {
    ui.updateButtons({
        connected: runtimeBridge.isConnected(),
        diagramCount: diagramRuntime.getDiagramCount(),
        analysisReady: isAnalysisReady()
    })
}

/**
 * Draws runtime analysis and clears spread table area.
 * @returns {Promise<void>}
 */
async function renderRuntimeAnalysis() {
    ui.clearAnalysisTable()
    await runtimeBridge.renderRuntimeAnalysis(ui.dom.analysisCanvas, diagramRuntime.getCycles())
}

/**
 * Draws spread analysis from worker rows or main-thread fallback.
 * @returns {Promise<void>}
 */
async function renderSpreadAnalysis() {
    const token = ++spreadRequestToken
    const spreadRows = await runtimeBridge.getSpreadRows(diagramRuntime.getCycles())
    if (token !== spreadRequestToken) return

    if (spreadRows) {
        ui.setAnalysisTableHtml(buildImpulseSpreadTableFromRows(spreadRows))
        return
    }

    const ctx = ui.dom.analysisCanvas.getContext('2d')
    ctx.clearRect(0, 0, ui.dom.analysisCanvas.width, ui.dom.analysisCanvas.height)
    ui.setAnalysisTableHtml(buildImpulseSpreadTable(diagramRuntime.getCycles()))
}

/**
 * Rebuilds active analysis content when locale or data changes.
 * @returns {void}
 */
function refreshAnalysisContent() {
    if (ui.dom.analysisCard.hidden) return

    if (activeAnalysis === 'runtime') {
        void renderRuntimeAnalysis().catch((error) => {
            console.error(error)
            ui.setWarn(String(error?.message || error))
        })
        return
    }

    if (activeAnalysis === 'spread') {
        void renderSpreadAnalysis().catch((error) => {
            console.error(error)
            ui.setWarn(String(error?.message || error))
        })
    }
}

/**
 * Redraws cards and localized labels.
 * @returns {void}
 */
function refreshDiagramCards() {
    diagramRuntime.refreshDiagramCards({
        drawDiagram: (diagramId, canvas, cycle, ideal) => {
            runtimeBridge.drawDiagram(diagramId, canvas, cycle, ideal)
        }
    })
}

/**
 * Cancels pending locale refresh idle work.
 * @returns {void}
 */
function clearPendingLocaleRefresh() {
    localeRefreshToken += 1
    if (!cancelLocaleRefreshIdle) return
    cancelLocaleRefreshIdle()
    cancelLocaleRefreshIdle = null
}

/**
 * Schedules heavy locale-dependent redraw work during idle time.
 * @returns {void}
 */
function scheduleLocalizedHeavyRefresh() {
    clearPendingLocaleRefresh()
    const token = localeRefreshToken

    cancelLocaleRefreshIdle = scheduleIdle(
        () => {
            cancelLocaleRefreshIdle = null
            // Ignore stale callbacks from earlier locale changes.
            if (token !== localeRefreshToken) return
            refreshAnalysisContent()
            if (token !== localeRefreshToken) return
            refreshDiagramCards()
        },
        { timeout: 200 }
    )
}

/**
 * Refreshes localized dynamic UI text.
 * @param {object} [options]
 * @param {boolean} [options.deferHeavy=false]
 * @returns {void}
 */
function refreshLocalizedUi({ deferHeavy = false } = {}) {
    ui.updateStartButtonLabel(runtimeBridge.isRunning())
    ui.updatePulseDotTitles()
    ui.refreshAnalysisTitle(activeAnalysis)
    setPortLabel()

    if (deferHeavy) {
        scheduleLocalizedHeavyRefresh()
        return
    }

    clearPendingLocaleRefresh()
    refreshAnalysisContent()
    refreshDiagramCards()
}

/**
 * Applies locale to UI and runtime workers.
 * @param {string} locale
 * @returns {string}
 */
function applyLocale(locale) {
    const resolvedLocale = setLocale(locale)
    applyTranslations()
    document.title = t('app.title')

    diagramRuntime.setTranslator(t)
    void runtimeBridge.setRenderLocale(resolvedLocale).catch((error) => {
        console.error(error)
    })

    refreshLocalizedUi({ deferHeavy: true })
    return resolvedLocale
}

/**
 * Initializes locale from storage/browser and wires selector changes.
 * @returns {void}
 */
function initLocalization() {
    const storedLocale = ui.loadStoredLocale()
    let initialLocale = storedLocale

    if (!initialLocale && typeof navigator !== 'undefined') {
        initialLocale = navigator.language
    }

    const resolvedLocale = applyLocale(initialLocale || 'en')
    ui.setLocale(resolvedLocale)

    if (!ui.dom.selLocale) return

    ui.dom.selLocale.addEventListener('change', () => {
        if (controller) {
            controller.setLocale(ui.getLocale())
            return
        }

        const nextLocale = applyLocale(ui.getLocale())
        ui.saveStoredLocale(nextLocale)
    })
}

/**
 * Returns an ideal reference cycle.
 * @returns {object}
 */
function createIdealCycle() {
    const times = []
    times.push(0, 62)

    for (let value = 2; value <= 18; value += 2) {
        const on = value * 50
        times.push(on, on + 62)
    }

    return {
        createdAt: new Date(),
        nsiTimesMs: times,
        pulses: 10,
        digit: 0,
        fHz: 10.0,
        dutyClosed: 38,
        nsaOpenMs: 980,
        nsrOnMs: 980,
        debounceMs: 0,
        hasNsa: true,
        hasNsr: true,
        warnings: []
    }
}

/**
 * Returns a lightweight analysis summary payload.
 * @returns {object}
 */
function getAnalysisSnapshot() {
    const cycles = diagramRuntime.getCycles()
    const ready = isAnalysisReady()

    const runtimes = cycles
        .map((cycle) => {
            if (cycle.hasNsa && typeof cycle.nsaOpenMs === 'number') return cycle.nsaOpenMs
            const times = cycle.nsiTimesMs || []
            if (times.length === 0) return null
            return times[times.length - 1] - times[0]
        })
        .filter((value) => typeof value === 'number')

    const runtimeSpreadMs = runtimes.length > 0 ? Math.max(...runtimes) - Math.min(...runtimes) : 0

    return {
        ready,
        mode: activeAnalysis,
        cycleCount: cycles.length,
        digit: ready ? cycles[0].digit : null,
        runtimeSpreadMs
    }
}

/**
 * Returns state snapshot used by WebMCP and actions.
 * @returns {object}
 */
function getStateSnapshot() {
    return {
        connected: runtimeBridge.isConnected(),
        running: runtimeBridge.isRunning(),
        debounceMs: ui.getDebounceMs(),
        dtmfEnabled: ui.isDtmfEnabled(),
        digit: ui.dom.valDigit.textContent,
        pulses: Number(ui.dom.valPulses.textContent),
        diagramCount: diagramRuntime.getDiagramCount(),
        analysisReady: isAnalysisReady(),
        activeAnalysis,
        locale: ui.getLocale(),
        warningVisible: !ui.dom.warnBox.hidden,
        portInfo: ui.dom.portInfo.textContent || ''
    }
}

/**
 * Connect action shared by UI and WebMCP.
 * @returns {Promise<object>}
 */
async function connectComAction() {
    if (runtimeBridge.isConnected()) {
        return getStateSnapshot()
    }

    try {
        await runtimeBridge.connect()
        ui.setWarn('')
        setPortLabel()
        updateButtons()
        return getStateSnapshot()
    } catch (error) {
        const warning = runtimeBridge.toConnectWarning(error)
        ui.setWarn(warning.message, warning.link)
        throw error
    }
}

/**
 * Disconnect action shared by UI and WebMCP.
 * @returns {Promise<object>}
 */
async function disconnectComAction() {
    try {
        await runtimeBridge.disconnect()
    } finally {
        ui.resetSignalIndicators()
        setPortLabel()
        ui.setWarn('')
        updateButtons()
    }

    return getStateSnapshot()
}

/**
 * Start action shared by UI and WebMCP.
 * @returns {Promise<object>}
 */
async function startTestAction() {
    ui.setWarn('')
    await runtimeBridge.startMeasurement()
    updateButtons()
    return getStateSnapshot()
}

/**
 * Stop action shared by UI and WebMCP.
 * @returns {object}
 */
function stopTestAction() {
    runtimeBridge.stopMeasurement()
    updateButtons()
    return getStateSnapshot()
}

/**
 * Updates debounce configuration.
 * @param {number} debounceMs
 * @returns {object}
 */
function setDebounceAction(debounceMs) {
    const clamped = Math.max(0, Math.min(10, Number(debounceMs) || 0))
    ui.dom.selDebounce.value = String(clamped)
    runtimeBridge.setDebounce(clamped)
    return getStateSnapshot()
}

/**
 * Updates DTMF checkbox state.
 * @param {boolean} enabled
 * @returns {object}
 */
function setDtmfEnabledAction(enabled) {
    ui.setDtmfEnabled(!!enabled)
    return getStateSnapshot()
}

/**
 * Adds ideal reference diagrams.
 * @param {number} [count=10]
 * @returns {object}
 */
function addIdealDiagramsAction(count = 10) {
    const safeCount = Math.max(1, Math.min(10, Number(count) || 10))
    const idealCycle = createIdealCycle()

    for (let index = 0; index < safeCount; index += 1) {
        diagramRuntime.addDiagram(idealCycle, {
            ideal: true,
            drawDiagram: (diagramId, canvas, cycle, ideal) => {
                runtimeBridge.drawDiagram(diagramId, canvas, cycle, ideal)
            },
            onBeforeRemove: (diagramId, canvas) => {
                runtimeBridge.detachDiagramCanvas(diagramId, canvas)
            }
        })
    }

    ui.setDiagramCount(diagramRuntime.getDiagramCount())
    updateButtons()
    return getStateSnapshot()
}

/**
 * Clears all diagrams and resets related analysis/metric UI.
 * @returns {object}
 */
function clearDiagramsAction() {
    diagramRuntime.clearDiagrams({
        onBeforeRemove: (diagramId, canvas) => {
            runtimeBridge.detachDiagramCanvas(diagramId, canvas)
        }
    })

    ui.setDiagramCount(0)
    ui.setWarn('')
    ui.resetCycleValues()
    ui.setAnalysisVisible(false)
    ui.clearAnalysisTable()

    activeAnalysis = null
    ui.refreshAnalysisTitle(activeAnalysis)

    void runtimeBridge.clearAnalysis(ui.dom.analysisCanvas).catch(() => {})

    updateButtons()
    return getStateSnapshot()
}

/**
 * Shows one analysis mode and renders content.
 * @param {'runtime'|'spread'} mode
 * @returns {object}
 */
function showAnalysisAction(mode) {
    if (!isAnalysisReady()) {
        throw new Error('Analysis requires 10 diagrams with the same digit.')
    }

    ui.setAnalysisVisible(true)
    activeAnalysis = mode
    ui.refreshAnalysisTitle(activeAnalysis)

    if (mode === 'runtime') {
        void renderRuntimeAnalysis().catch((error) => {
            console.error(error)
            ui.setWarn(String(error?.message || error))
        })
        return getAnalysisSnapshot()
    }

    if (mode === 'spread') {
        void renderSpreadAnalysis().catch((error) => {
            console.error(error)
            ui.setWarn(String(error?.message || error))
        })
        return getAnalysisSnapshot()
    }

    throw new Error(`Unsupported analysis mode: ${mode}`)
}

/**
 * Exports composed strip image in requested format.
 * @param {'png'|'jpg'|'print'} format
 * @returns {Promise<{ format: string, diagramCount: number }>}
 */
async function exportStripAction(format) {
    const cards = diagramRuntime.getCards()
    if (cards.length === 0) {
        throw new Error(t('errors.noDiagramsToExport'))
    }

    const diagramIds = diagramRuntime.getVisibleDiagramIds()
    const canvases = cards
        .map((card) => /** @type {HTMLCanvasElement|null} */ (card.querySelector('canvas')))
        .filter(Boolean)

    const exported = await runtimeBridge.exportStrip(diagramIds, canvases, format, composeStripImage)

    if (exported.source === 'blob' && exported.blob) {
        if (format === 'print') {
            printBlob(exported.blob)
            return { format, diagramCount: exported.diagramCount }
        }

        if (format === 'png') {
            downloadBlob(exported.blob, 'pruefstreifen.png')
            return { format, diagramCount: exported.diagramCount }
        }

        if (format === 'jpg') {
            downloadBlob(exported.blob, 'pruefstreifen.jpg')
            return { format, diagramCount: exported.diagramCount }
        }
    }

    if (exported.source === 'canvas' && exported.canvas) {
        if (format === 'print') {
            printCanvas(exported.canvas)
            return { format, diagramCount: exported.diagramCount }
        }

        if (format === 'png') {
            downloadCanvas(exported.canvas, 'pruefstreifen.png', 'image/png')
            return { format, diagramCount: exported.diagramCount }
        }

        if (format === 'jpg') {
            downloadCanvas(exported.canvas, 'pruefstreifen.jpg', 'image/jpeg', 0.92)
            return { format, diagramCount: exported.diagramCount }
        }
    }

    throw new Error(`Unsupported export format: ${format}`)
}

/**
 * Downloads one diagram by index.
 * @param {number} index
 * @returns {Promise<{ index: number, filename: string }>}
 */
async function downloadDiagramAction(index) {
    const normalizedIndex = Number(index)
    if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) {
        throw new Error(t('errors.diagramNotFound'))
    }

    const entry = diagramRuntime.getEntryByIndex(normalizedIndex)
    if (!entry) {
        throw new Error(t('errors.diagramNotFound'))
    }

    const filename = diagramRuntime.buildDiagramFilename(entry.cycle, 'png')
    const exported = await runtimeBridge.exportDiagram(entry.diagramId, entry.canvas)

    if (exported.source === 'blob' && exported.blob) {
        downloadBlob(exported.blob, filename)
        return { index: normalizedIndex, filename }
    }

    if (exported.source === 'canvas' && exported.canvas) {
        downloadCanvas(exported.canvas, filename, 'image/png')
        return { index: normalizedIndex, filename }
    }

    throw new Error(t('errors.diagramNotFound'))
}

/**
 * Applies locale and persists selection.
 * @param {string} locale
 * @returns {{ locale: string, state: object }}
 */
function setLocaleAction(locale) {
    const resolvedLocale = applyLocale(locale)
    ui.setLocale(resolvedLocale)
    ui.saveStoredLocale(resolvedLocale)

    return {
        locale: resolvedLocale,
        state: getStateSnapshot()
    }
}

/**
 * Opens help dialog.
 * @returns {{ helpOpen: boolean }}
 */
function openHelpAction() {
    if (!ui.dom.dlgHelp.open) {
        ui.dom.dlgHelp.showModal()
    }
    return { helpOpen: ui.dom.dlgHelp.open }
}

/**
 * Closes help dialog.
 * @returns {{ helpOpen: boolean }}
 */
function closeHelpAction() {
    if (ui.dom.dlgHelp.open) {
        ui.dom.dlgHelp.close()
    }
    return { helpOpen: ui.dom.dlgHelp.open }
}

/**
 * Wires UI event handlers to controller actions.
 * @returns {void}
 */
function bindUiEvents() {
    ui.dom.btnConnect.addEventListener('click', async () => {
        try {
            await controller.connectCom({ preferKnown: false })
        } catch {}
    })

    ui.dom.btnDisconnect.addEventListener('click', async () => {
        await controller.disconnectCom()
    })

    ui.dom.btnStart.addEventListener('click', async () => {
        if (!runtimeBridge.isRunning()) {
            await controller.startTest()
            return
        }

        controller.stopTest()
    })

    ui.dom.selDebounce.addEventListener('change', () => {
        controller.setDebounce(ui.getDebounceMs())
    })

    ui.dom.btnIdeal.addEventListener('click', () => {
        controller.addIdealDiagrams(10)
    })

    ui.dom.btnClear.addEventListener('click', () => {
        controller.clearDiagrams()
    })

    ui.dom.btnPrint.addEventListener('click', async () => {
        try {
            await controller.exportStrip('print')
        } catch (error) {
            ui.setWarn(String(error?.message || error))
        }
    })

    ui.dom.btnSavePng.addEventListener('click', async () => {
        try {
            await controller.exportStrip('png')
        } catch (error) {
            ui.setWarn(String(error?.message || error))
        }
    })

    ui.dom.btnSaveJpg.addEventListener('click', async () => {
        try {
            await controller.exportStrip('jpg')
        } catch (error) {
            ui.setWarn(String(error?.message || error))
        }
    })

    ui.dom.btnHelp.addEventListener('click', () => {
        controller.openHelp()
    })

    ui.dom.btnCloseHelp.addEventListener('click', () => {
        controller.closeHelp()
    })

    ui.dom.btnRunTime.addEventListener('click', () => {
        try {
            controller.showAnalysis('runtime')
        } catch {}
    })

    ui.dom.btnSpread.addEventListener('click', () => {
        try {
            controller.showAnalysis('spread')
        } catch {}
    })
}

controller = new AppController({
    connectCom: connectComAction,
    disconnectCom: disconnectComAction,
    startTest: startTestAction,
    stopTest: stopTestAction,
    setDebounce: setDebounceAction,
    setDtmfEnabled: setDtmfEnabledAction,
    addIdealDiagrams: addIdealDiagramsAction,
    clearDiagrams: clearDiagramsAction,
    showAnalysis: showAnalysisAction,
    exportStrip: exportStripAction,
    downloadDiagram: downloadDiagramAction,
    setLocale: setLocaleAction,
    openHelp: openHelpAction,
    closeHelp: closeHelpAction,
    getState: getStateSnapshot,
    getCycles: () => diagramRuntime.getCyclesSnapshot(),
    getAnalysisSnapshot
})

diagramRuntime.setDownloadHandler(async ({ index, canvas, cycle }) => {
    if (controller && index >= 0) {
        await controller.downloadDiagram(index)
        return
    }

    downloadCanvas(canvas, diagramRuntime.buildDiagramFilename(cycle, 'png'), 'image/png')
})

bindUiEvents()
initLocalization()
ui.setDiagramPlaceholderVisible(true)
ui.resetSignalIndicators()
ui.setDiagramCount(0)
updateButtons()
setPortLabel()

runtimeBridge.scheduleRenderWorkerInit(ui.dom.analysisCanvas, () => {
    refreshDiagramCards()
    refreshAnalysisContent()
})

window.addEventListener('beforeunload', () => {
    void runtimeBridge.dispose()
})

void registerServiceWorker()
initWebMcp({ controller })
