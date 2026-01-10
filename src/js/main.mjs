import { SerialManager } from './serial/SerialManager.mjs'
import { RotaryTester } from './measurement/RotaryTester.mjs'
import { DtmfPlayer } from './audio/DtmfPlayer.mjs'
import { drawImpulseDiagram } from './render/impulseDiagram.mjs'
import { drawRunTimeScatter, buildImpulseSpreadTable } from './render/analysis.mjs'
import { composeStripImage, downloadCanvas, printCanvas } from './export.mjs'
import { applyTranslations, setLocale, t } from './i18n.mjs'

/**
 * Shorthand for document.querySelector.
 * @param {string} sel
 * @returns {Element|null}
 */
const $ = (sel) => document.querySelector(sel)

const btnConnect = $('#btnConnect')
const btnDisconnect = $('#btnDisconnect')
const btnStart = $('#btnStart')
const btnIdeal = $('#btnIdeal')
const btnClear = $('#btnClear')
const btnPrint = $('#btnPrint')
const btnSavePng = $('#btnSavePng')
const btnSaveJpg = $('#btnSaveJpg')
const btnHelp = $('#btnHelp')
const btnCloseHelp = $('#btnCloseHelp')
const dlgHelp = $('#dlgHelp')

const btnRunTime = $('#btnRunTime')
const btnSpread = $('#btnSpread')
const analysisCard = $('#analysisCard')
const analysisTitle = $('#analysisTitle')
const analysisCanvas = $('#analysisCanvas')
const analysisTableWrap = $('#analysisTableWrap')

const portInfo = $('#portInfo')
const warnBox = $('#warnBox')

const ledNsi = $('#ledNsi')
const ledNsr = $('#ledNsr')
const ledNsa = $('#ledNsa')

const valDigit = $('#valDigit')
const valPulses = $('#valPulses')
const valDiagram = $('#valDiagram')

const valHz = $('#valHz')
const gaugeHz = $('#gaugeHz')
const valDuty = $('#valDuty')
const gaugeDuty = $('#gaugeDuty')

const selDebounce = $('#selDebounce')
const chkDtmf = $('#chkDtmf')
const selLocale = $('#selLocale')

const diagramStrip = $('#diagramStrip')
const diagramPlaceholder = $('#diagramPlaceholder')

const pulseDots = $('#pulseDots')
for (let i = 1; i <= 10; i++) {
    const d = document.createElement('span')
    d.className = 'pulse-dot'
    pulseDots.appendChild(d)
}

const serial = new SerialManager()
const audio = new DtmfPlayer()

let tester = null

/** @type {Array<object>} */
let cycles = [] // last cycles (max 10)
let diagramCount = 0
const diagramCycleMap = new WeakMap()
let activeAnalysis = null

/**
 * Reads the last selected locale from storage if available.
 * @returns {string|null}
 */
function loadStoredLocale() {
    // Guard against storage access in restricted contexts.
    try {
        return localStorage.getItem('locale')
    } catch {
        return null
    }
}

/**
 * Persists the selected locale for the next visit.
 * @param {string} locale
 * @returns {void}
 */
function saveStoredLocale(locale) {
    // Persist only when storage is available.
    try {
        localStorage.setItem('locale', locale)
    } catch {}
}

/**
 * Updates the Start/Stop button label based on the tester state.
 * @returns {void}
 */
function updateStartButtonLabel() {
    const labelKey = tester?.running ? 'controls.stop' : 'controls.start'
    btnStart.textContent = t(labelKey)
}

/**
 * Updates pulse dot tooltips for the active locale.
 * @returns {void}
 */
function updatePulseDotTitles() {
    // Keep titles localized while the dots stay static.
    const dots = [...pulseDots.children]
    dots.forEach((dot, index) => {
        dot.title = t('pulseStrip.dotTitle', { count: index + 1 })
    })
}

/**
 * Updates the analysis title based on the current analysis mode.
 * @returns {void}
 */
function refreshAnalysisTitle() {
    // Default to the generic title when no analysis is active.
    if (activeAnalysis === 'runtime') {
        analysisTitle.textContent = t('analysis.runtimeTitle')
        return
    }
    if (activeAnalysis === 'spread') {
        analysisTitle.textContent = t('analysis.spreadTitle')
        return
    }
    analysisTitle.textContent = t('analysis.title')
}

/**
 * Rebuilds analysis visuals when the locale changes.
 * @returns {void}
 */
function refreshAnalysisContent() {
    // Only redraw when an analysis view is currently visible.
    if (analysisCard.hidden) return
    if (activeAnalysis === 'runtime') {
        analysisTableWrap.innerHTML = ''
        drawRunTimeScatter(analysisCanvas, cycles)
        return
    }
    if (activeAnalysis === 'spread') {
        const ctx = analysisCanvas.getContext('2d')
        ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height)
        analysisTableWrap.innerHTML = buildImpulseSpreadTable(cycles)
    }
}

/**
 * Re-renders diagram canvases and labels for the active locale.
 * @returns {void}
 */
function refreshDiagramCards() {
    const canvases = [...diagramStrip.querySelectorAll('canvas')]
    canvases.forEach((canvas) => {
        const entry = diagramCycleMap.get(canvas)
        if (!entry) return
        drawImpulseDiagram(canvas, entry.cycle, { ideal: entry.ideal })
        const card = canvas.closest('.diagram-card')
        if (!card) return
        const metaLeft = card.querySelector('.diagram-meta-left')
        if (metaLeft) {
            metaLeft.textContent = ''
            const digitStrong = document.createElement('strong')
            digitStrong.textContent = String(entry.cycle.digit)
            metaLeft.appendChild(digitStrong)
            metaLeft.appendChild(
                document.createTextNode(` - ${t('diagrams.pulsesMeta', { count: entry.cycle.pulses })}`)
            )
        }
        const downloadBtn = card.querySelector('.diagram-download')
        if (downloadBtn) {
            downloadBtn.textContent = t('diagrams.downloadPng')
        }
    })
}

/**
 * Applies localization to static and dynamic UI strings.
 * @returns {void}
 */
function refreshLocalizedUi() {
    // Re-sync text that is generated dynamically in JavaScript.
    updateStartButtonLabel()
    updatePulseDotTitles()
    refreshAnalysisTitle()
    refreshAnalysisContent()
    refreshDiagramCards()
    setPortLabel()
}

/**
 * Sets the locale and applies translations across the document.
 * @param {string} locale
 * @returns {string}
 */
function applyLocale(locale) {
    const resolvedLocale = setLocale(locale)
    applyTranslations()
    document.title = t('app.title')
    refreshLocalizedUi()
    return resolvedLocale
}

/**
 * Initializes localization and wires the language selector.
 * @returns {void}
 */
function initLocalization() {
    const storedLocale = loadStoredLocale()
    let initialLocale = storedLocale
    if (!initialLocale && typeof navigator !== 'undefined') {
        initialLocale = navigator.language
    }
    const resolvedLocale = applyLocale(initialLocale || 'en')
    if (!selLocale) return
    selLocale.value = resolvedLocale
    selLocale.addEventListener('change', () => {
        const nextLocale = applyLocale(selLocale.value)
        saveStoredLocale(nextLocale)
    })
}

/**
 * Shows or hides the warning box.
 * @param {string} msg
 * @returns {void}
 */
function setWarn(msg) {
    if (!msg) {
        warnBox.hidden = true
        warnBox.textContent = ''
        return
    }
    warnBox.hidden = false
    warnBox.textContent = msg
}

/**
 * Updates an LED indicator based on a boolean value.
 * @param {Element} el
 * @param {boolean} on
 * @returns {void}
 */
function setLed(el, on) {
    el.classList.toggle('on', !!on)
    el.classList.toggle('off', !on)
}

/**
 * Clears the pulse dot indicators.
 * @returns {void}
 */
function resetPulseDots() {
    const dots = [...pulseDots.children]
    dots.forEach((d) => d.classList.remove('on', 'bad'))
}

/**
 * Updates pulse dot indicators for the current pulse count.
 * @param {number} pulses
 * @returns {void}
 */
function updatePulseDots(pulses) {
    resetPulseDots()
    const dots = [...pulseDots.children]
    for (let i = 0; i < Math.min(pulses, 10); i++) {
        dots[i].classList.add('on')
    }
    if (pulses > 10) {
        dots.forEach((d) => d.classList.add('bad'))
    }
}

/**
 * Enables or disables controls based on current state.
 * @returns {void}
 */
function updateButtons() {
    const connected = serial.isOpen
    btnDisconnect.disabled = !connected
    btnStart.disabled = !connected
    selDebounce.disabled = !connected
    chkDtmf.disabled = !connected
    btnIdeal.disabled = !connected
    btnClear.disabled = !connected
    btnPrint.disabled = !connected || diagramCount === 0
    btnSavePng.disabled = !connected || diagramCount === 0
    btnSaveJpg.disabled = !connected || diagramCount === 0

    // analysis enabled only when we have 10 cycles of same digit
    const analysisReady = cycles.length === 10 && cycles.every((c) => c.digit === cycles[0].digit)
    btnRunTime.disabled = !analysisReady
    btnSpread.disabled = !analysisReady
}

/**
 * Updates the port info label.
 * @returns {void}
 */
function setPortLabel() {
    portInfo.textContent = serial.getInfoString()
}

/**
 * Toggles the empty-state placeholder for the diagram list.
 * @param {boolean} visible
 * @returns {void}
 */
function setDiagramPlaceholder(visible) {
    if (!diagramPlaceholder) return
    diagramPlaceholder.hidden = !visible
}

/**
 * Starts the test run if not already running.
 * @returns {Promise<void>}
 */
async function startTest() {
    if (!tester || tester.running) return
    tester.setDebounceMs(Number(selDebounce.value))
    setWarn('')
    await tester.start()
    if (tester.running) {
        btnStart.classList.add('on')
        updateStartButtonLabel()
    }
}

/**
 * Stops the test run and resets the button state.
 * @returns {void}
 */
function stopTest() {
    tester?.stop()
    btnStart.classList.remove('on')
    updateStartButtonLabel()
}

btnConnect.addEventListener('click', async () => {
    try {
        await serial.connect()
        setPortLabel()

        tester = new RotaryTester({
            serial,
            onSignals: (sig) => {
                setLed(ledNsi, sig.dataCarrierDetect)
                setLed(ledNsr, sig.dataSetReady)
                setLed(ledNsa, sig.ringIndicator)

                // live pulse indicator: we only know pulses after changes, but show line state anyway
            },
            onCycle: async (cycle) => {
                // audio feedback
                if (chkDtmf.checked) {
                    const key = cycle.digit === 0 ? '0' : String(cycle.digit)
                    await audio.playKey(key, 200)
                } else {
                    await audio.beep(450, 200)
                }

                // warnings
                if (cycle.warnings?.length) {
                    setWarn(cycle.warnings.join(' '))
                } else {
                    setWarn('')
                }

                // update metrics
                valDigit.textContent = String(cycle.digit)
                valPulses.textContent = String(cycle.pulses)
                valHz.textContent = cycle.fHz.toFixed(1)
                gaugeHz.value = String(Math.max(7, Math.min(13, cycle.fHz)))
                valDuty.textContent = String(cycle.dutyClosed)
                gaugeDuty.value = String(Math.max(10, Math.min(70, cycle.dutyClosed)))
                updatePulseDots(cycle.pulses)

                // render diagram (keep last 10)
                addDiagram(cycle)

                updateButtons()
            },
            onWarn: (msg) => setWarn(msg)
        })

        updateButtons()
        await startTest()
    } catch (err) {
        setWarn(String(err?.message || err))
    }
})

btnDisconnect.addEventListener('click', async () => {
    try {
        stopTest()
        await serial.disconnect()
    } finally {
        setPortLabel()
        setWarn('')
        updateButtons()
    }
})

btnStart.addEventListener('click', async () => {
    if (!tester) return
    if (!tester.running) {
        await startTest()
    } else {
        stopTest()
    }
})

selDebounce.addEventListener('change', () => {
    tester?.setDebounceMs(Number(selDebounce.value))
})

btnIdeal.addEventListener('click', () => {
    // Recreate the ideal dial from the original:
    const t = []
    t.push(0, 62)
    for (let x = 2; x <= 18; x += 2) {
        const on = x * 50 // 100,200,...,900
        t.push(on, on + 62)
    }
    const cycle = {
        createdAt: new Date(),
        nsiTimesMs: t,
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

    // Insert 10x like the PB test
    for (let i = 0; i < 10; i++) {
        addDiagram(cycle, { ideal: true })
    }
    updateButtons()
})

btnClear.addEventListener('click', () => {
    cycles = []
    diagramCount = 0
    diagramStrip.innerHTML = ''
    valDiagram.textContent = '0/10'
    setWarn('')
    resetPulseDots()
    valDigit.textContent = '-'
    valPulses.textContent = '0'
    valHz.textContent = '0.0'
    gaugeHz.value = '7'
    valDuty.textContent = '0'
    gaugeDuty.value = '10'

    analysisCard.hidden = true
    analysisTableWrap.innerHTML = ''
    activeAnalysis = null
    refreshAnalysisTitle()
    // Show the empty-state hint after clearing all diagrams.
    setDiagramPlaceholder(true)
    updateButtons()
})

btnPrint.addEventListener('click', () => {
    const canvases = [...diagramStrip.querySelectorAll('canvas')]
    const composed = composeStripImage(canvases)
    if (composed) printCanvas(composed)
})

btnSavePng.addEventListener('click', () => {
    const canvases = [...diagramStrip.querySelectorAll('canvas')]
    const composed = composeStripImage(canvases)
    if (composed) downloadCanvas(composed, 'pruefstreifen.png', 'image/png')
})

btnSaveJpg.addEventListener('click', () => {
    const canvases = [...diagramStrip.querySelectorAll('canvas')]
    const composed = composeStripImage(canvases)
    if (composed) downloadCanvas(composed, 'pruefstreifen.jpg', 'image/jpeg', 0.92)
})

btnHelp.addEventListener('click', () => dlgHelp.showModal())
btnCloseHelp.addEventListener('click', () => dlgHelp.close())

btnRunTime.addEventListener('click', () => {
    const ready = cycles.length === 10 && cycles.every((c) => c.digit === cycles[0].digit)
    if (!ready) return
    analysisCard.hidden = false
    activeAnalysis = 'runtime'
    refreshAnalysisTitle()
    analysisTableWrap.innerHTML = ''
    drawRunTimeScatter(analysisCanvas, cycles)
})

btnSpread.addEventListener('click', () => {
    const ready = cycles.length === 10 && cycles.every((c) => c.digit === cycles[0].digit)
    if (!ready) return
    analysisCard.hidden = false
    activeAnalysis = 'spread'
    refreshAnalysisTitle()
    // optional: clear the canvas and show the table
    const ctx = analysisCanvas.getContext('2d')
    ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height)
    analysisTableWrap.innerHTML = buildImpulseSpreadTable(cycles)
})

/**
 * Builds a filename for a single diagram export.
 * @param {object} cycle
 * @param {string} [ext='png']
 * @returns {string}
 */
function buildDiagramFilename(cycle, ext = 'png') {
    const createdAt = cycle?.createdAt ? new Date(cycle.createdAt) : new Date()
    const stamp = createdAt.toISOString().replace(/[:.]/g, '-')
    return `diagram-${cycle.digit}-${stamp}.${ext}`
}

/**
 * Renders a diagram card and appends it to the list.
 * @param {object} cycle
 * @param {object} [options]
 * @param {boolean} [options.ideal=false]
 * @returns {void}
 */
function addDiagram(cycle, { ideal = false } = {}) {
    // keep last 10 like PB (rolling)
    if (cycles.length === 10) {
        cycles.shift()
        diagramStrip.removeChild(diagramStrip.firstElementChild)
    }

    const card = document.createElement('div')
    card.className = 'diagram-card'

    const canvas = document.createElement('canvas')
    canvas.width = 1400
    canvas.height = 150
    canvas.className = 'diagram-canvas'
    drawImpulseDiagram(canvas, cycle, { ideal })

    const meta = document.createElement('div')
    meta.className = 'diagram-meta'
    const metaLeft = document.createElement('div')
    metaLeft.className = 'diagram-meta-left'
    const digitStrong = document.createElement('strong')
    digitStrong.textContent = String(cycle.digit)
    metaLeft.appendChild(digitStrong)
    metaLeft.appendChild(document.createTextNode(` - ${t('diagrams.pulsesMeta', { count: cycle.pulses })}`))

    const metaRight = document.createElement('div')
    metaRight.className = 'diagram-actions'
    const stats = document.createElement('div')
    stats.className = 'diagram-stats'
    stats.textContent = `${cycle.fHz.toFixed(1)} Hz - ${cycle.dutyClosed}%`

    const btnDownload = document.createElement('button')
    btnDownload.type = 'button'
    btnDownload.className = 'btn small diagram-download'
    btnDownload.textContent = t('diagrams.downloadPng')
    btnDownload.addEventListener('click', (event) => {
        event.stopPropagation()
        downloadCanvas(canvas, buildDiagramFilename(cycle, 'png'), 'image/png')
    })

    metaRight.appendChild(stats)
    metaRight.appendChild(btnDownload)
    meta.appendChild(metaLeft)
    meta.appendChild(metaRight)
    card.appendChild(meta)
    card.appendChild(canvas)

    diagramCycleMap.set(canvas, { cycle, ideal })

    diagramStrip.appendChild(card)
    cycles.push(cycle)
    // Hide the empty-state hint when at least one diagram is present.
    setDiagramPlaceholder(false)

    diagramCount = cycles.length
    valDiagram.textContent = `${diagramCount}/10`

    // analysis enablement
    updateButtons()
}

// initial state
initLocalization()
setDiagramPlaceholder(true)
updateButtons()
