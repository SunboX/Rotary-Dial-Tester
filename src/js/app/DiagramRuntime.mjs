import { downloadCanvas } from '../export.mjs'

/**
 * Manages diagram card DOM rendering and cycle-index mapping.
 */
export class DiagramRuntime {
    /** @type {(key: string, params?: Record<string, unknown>) => string} */
    #t

    /** @type {HTMLElement} */
    #diagramStrip

    /** @type {HTMLElement} */
    #diagramPlaceholder

    /** @type {Array<object>} */
    #cycles = []

    /** @type {WeakMap<HTMLCanvasElement, { cycle: object, ideal: boolean, diagramId: string }>} */
    #diagramCycleMap = new WeakMap()

    /** @type {Map<string, { cycle: object, ideal: boolean }>} */
    #diagramEntriesById = new Map()

    /** @type {number} */
    #diagramIdCounter = 0

    /** @type {(context: { index: number, canvas: HTMLCanvasElement, cycle: object }) => Promise<void>|void} */
    #downloadHandler = async ({ canvas, cycle }) => {
        downloadCanvas(canvas, this.buildDiagramFilename(cycle, 'png'), 'image/png')
    }

    /**
     * @param {object} options
     * @param {(key: string, params?: Record<string, unknown>) => string} options.translate
     * @param {HTMLElement} options.diagramStrip
     * @param {HTMLElement} options.diagramPlaceholder
     */
    constructor({ translate, diagramStrip, diagramPlaceholder }) {
        this.#t = translate
        this.#diagramStrip = diagramStrip
        this.#diagramPlaceholder = diagramPlaceholder
    }

    /**
     * Updates translator function used for dynamic card text.
     * @param {(key: string, params?: Record<string, unknown>) => string} translate
     * @returns {void}
     */
    setTranslator(translate) {
        this.#t = translate
    }

    /**
     * Sets download handler called by per-card download buttons.
     * @param {(context: { index: number, canvas: HTMLCanvasElement, cycle: object }) => Promise<void>|void} handler
     * @returns {void}
     */
    setDownloadHandler(handler) {
        if (typeof handler === 'function') {
            this.#downloadHandler = handler
        }
    }

    /**
     * Returns live cycles array.
     * @returns {Array<object>}
     */
    getCycles() {
        return this.#cycles
    }

    /**
     * Returns current diagram count.
     * @returns {number}
     */
    getDiagramCount() {
        return this.#cycles.length
    }

    /**
     * Returns whether runtime/spread analysis is currently available.
     * @returns {boolean}
     */
    isAnalysisReady() {
        return this.#cycles.length === 10 && this.#cycles.every((cycle) => cycle.digit === this.#cycles[0].digit)
    }

    /**
     * Returns all current diagram cards in display order.
     * @returns {Array<HTMLElement>}
     */
    getCards() {
        return [...this.#diagramStrip.querySelectorAll('.diagram-card')]
    }

    /**
     * Builds stable filename for one diagram export.
     * @param {object} cycle
     * @param {string} [ext='png']
     * @returns {string}
     */
    buildDiagramFilename(cycle, ext = 'png') {
        const createdAt = cycle?.createdAt ? new Date(cycle.createdAt) : new Date()
        const stamp = createdAt.toISOString().replace(/[:.]/g, '-')
        return `diagram-${cycle.digit}-${stamp}.${ext}`
    }

    /**
     * Adds one diagram card and keeps max history length at ten.
     * @param {object} cycle
     * @param {object} options
     * @param {(diagramId: string, canvas: HTMLCanvasElement, cycle: object, ideal: boolean) => void} options.drawDiagram
     * @param {(diagramId: string, canvas: HTMLCanvasElement) => void} [options.onBeforeRemove]
     * @param {boolean} [options.ideal=false]
     * @returns {{ diagramId: string, diagramCount: number }}
     */
    addDiagram(cycle, { drawDiagram, onBeforeRemove, ideal = false }) {
        if (this.#cycles.length === 10) {
            this.#removeOldest({ onBeforeRemove })
        }

        const diagramId = `diagram-${++this.#diagramIdCounter}`
        const card = this.#createDiagramCard(diagramId, cycle)
        const canvas = /** @type {HTMLCanvasElement} */ (card.querySelector('canvas'))

        this.#diagramCycleMap.set(canvas, { cycle, ideal, diagramId })
        this.#diagramEntriesById.set(diagramId, { cycle, ideal })
        this.#diagramStrip.appendChild(card)
        this.#cycles.push(cycle)

        drawDiagram(diagramId, canvas, cycle, ideal)

        this.#diagramPlaceholder.hidden = true
        return {
            diagramId,
            diagramCount: this.#cycles.length
        }
    }

    /**
     * Refreshes localized card labels and redraws diagrams.
     * @param {object} options
     * @param {(diagramId: string, canvas: HTMLCanvasElement, cycle: object, ideal: boolean) => void} options.drawDiagram
     * @returns {void}
     */
    refreshDiagramCards({ drawDiagram }) {
        const cards = this.getCards()

        cards.forEach((card) => {
            const canvas = /** @type {HTMLCanvasElement|null} */ (card.querySelector('canvas'))
            const diagramId = String(card.getAttribute('data-diagram-id') || '')
            const entry = this.#diagramEntriesById.get(diagramId)
            if (!canvas || !entry) return

            drawDiagram(diagramId, canvas, entry.cycle, entry.ideal)

            const metaLeft = card.querySelector('.diagram-meta-left')
            if (metaLeft) {
                metaLeft.textContent = ''
                const digitStrong = document.createElement('strong')
                digitStrong.textContent = String(entry.cycle.digit)
                metaLeft.appendChild(digitStrong)
                metaLeft.appendChild(
                    document.createTextNode(` - ${this.#t('diagrams.pulsesMeta', { count: entry.cycle.pulses })}`)
                )
            }

            const downloadButton = card.querySelector('.diagram-download')
            if (downloadButton) {
                downloadButton.textContent = this.#t('diagrams.downloadPng')
            }
        })
    }

    /**
     * Clears all diagram cards and cycle mappings.
     * @param {object} [options]
     * @param {(diagramId: string, canvas: HTMLCanvasElement) => void} [options.onBeforeRemove]
     * @returns {void}
     */
    clearDiagrams({ onBeforeRemove } = {}) {
        const cards = this.getCards()
        cards.forEach((card) => {
            const diagramId = String(card.getAttribute('data-diagram-id') || '')
            const canvas = /** @type {HTMLCanvasElement|null} */ (card.querySelector('canvas'))
            if (!canvas) return

            onBeforeRemove?.(diagramId, canvas)
            this.#diagramCycleMap.delete(canvas)
        })

        this.#cycles = []
        this.#diagramEntriesById.clear()
        this.#diagramStrip.innerHTML = ''
        this.#diagramPlaceholder.hidden = false
    }

    /**
     * Returns diagram IDs in current display order.
     * @returns {Array<string>}
     */
    getVisibleDiagramIds() {
        return this.getCards()
            .map((card) => String(card.getAttribute('data-diagram-id') || ''))
            .filter(Boolean)
    }

    /**
     * Returns one diagram entry by index.
     * @param {number} index
     * @returns {{ canvas: HTMLCanvasElement, cycle: object, diagramId: string }|null}
     */
    getEntryByIndex(index) {
        const normalizedIndex = Number(index)
        if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) {
            return null
        }

        const cards = this.getCards()
        const card = cards[normalizedIndex]
        if (!card) return null

        const canvas = /** @type {HTMLCanvasElement|null} */ (card.querySelector('canvas'))
        const diagramId = String(card.getAttribute('data-diagram-id') || '')
        const entry = this.#diagramEntriesById.get(diagramId)

        if (!canvas || !entry) return null
        return {
            canvas,
            cycle: entry.cycle,
            diagramId
        }
    }

    /**
     * Returns a serializable copy of captured cycles.
     * @returns {Array<object>}
     */
    getCyclesSnapshot() {
        return this.#cycles.map((cycle) => ({
            ...cycle,
            createdAt: cycle?.createdAt ? new Date(cycle.createdAt).toISOString() : null,
            nsiTimesMs: Array.isArray(cycle.nsiTimesMs) ? [...cycle.nsiTimesMs] : [],
            warnings: Array.isArray(cycle.warnings) ? [...cycle.warnings] : []
        }))
    }

    /**
     * Returns cycle+draw settings for a diagram ID.
     * @param {string} diagramId
     * @returns {{ cycle: object, ideal: boolean }|null}
     */
    getEntryByDiagramId(diagramId) {
        return this.#diagramEntriesById.get(String(diagramId)) || null
    }

    /**
     * Removes and detaches the oldest diagram card.
     * @param {object} options
     * @param {(diagramId: string, canvas: HTMLCanvasElement) => void} [options.onBeforeRemove]
     * @returns {void}
     */
    #removeOldest({ onBeforeRemove }) {
        const oldestCard = this.#diagramStrip.querySelector('.diagram-card')
        if (!oldestCard) return

        const diagramId = String(oldestCard.getAttribute('data-diagram-id') || '')
        const canvas = /** @type {HTMLCanvasElement|null} */ (oldestCard.querySelector('canvas'))

        if (canvas) {
            onBeforeRemove?.(diagramId, canvas)
            this.#diagramCycleMap.delete(canvas)
        }

        if (diagramId) {
            this.#diagramEntriesById.delete(diagramId)
        }

        oldestCard.remove()
        this.#cycles.shift()
    }

    /**
     * Creates one diagram card element with metadata and action controls.
     * @param {string} diagramId
     * @param {object} cycle
     * @returns {HTMLElement}
     */
    #createDiagramCard(diagramId, cycle) {
        const card = document.createElement('div')
        card.className = 'diagram-card'
        card.setAttribute('data-diagram-id', diagramId)

        const canvas = document.createElement('canvas')
        canvas.width = 1400
        canvas.height = 150
        canvas.className = 'diagram-canvas'

        const meta = document.createElement('div')
        meta.className = 'diagram-meta'

        const metaLeft = document.createElement('div')
        metaLeft.className = 'diagram-meta-left'
        const digitStrong = document.createElement('strong')
        digitStrong.textContent = String(cycle.digit)
        metaLeft.appendChild(digitStrong)
        metaLeft.appendChild(document.createTextNode(` - ${this.#t('diagrams.pulsesMeta', { count: cycle.pulses })}`))

        const metaRight = document.createElement('div')
        metaRight.className = 'diagram-actions'

        const stats = document.createElement('div')
        stats.className = 'diagram-stats'
        stats.textContent = `${cycle.fHz.toFixed(1)} Hz - ${cycle.dutyClosed}%`

        const downloadButton = document.createElement('button')
        downloadButton.type = 'button'
        downloadButton.className = 'btn small diagram-download'
        downloadButton.textContent = this.#t('diagrams.downloadPng')
        downloadButton.addEventListener('click', (event) => {
            event.stopPropagation()
            void this.#handleDownloadClick(card, canvas, cycle)
        })

        metaRight.appendChild(stats)
        metaRight.appendChild(downloadButton)
        meta.appendChild(metaLeft)
        meta.appendChild(metaRight)

        card.appendChild(meta)
        card.appendChild(canvas)

        return card
    }

    /**
     * Resolves index mapping and triggers configured per-card download action.
     * @param {HTMLElement} card
     * @param {HTMLCanvasElement} canvas
     * @param {object} cycle
     * @returns {Promise<void>}
     */
    async #handleDownloadClick(card, canvas, cycle) {
        const cards = this.getCards()
        const index = cards.indexOf(card)
        if (index < 0) return
        await this.#downloadHandler({ index, canvas, cycle })
    }
}
