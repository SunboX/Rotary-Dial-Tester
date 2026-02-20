import { setLocale } from '../i18n.mjs'
import { computeImpulseSpreadRows, drawRunTimeScatter } from '../render/analysis.mjs'
import { drawImpulseDiagram } from '../render/impulseDiagram.mjs'
import { createWorkerError, createWorkerResponse, RENDER_INBOUND, RENDER_OUTBOUND } from './WorkerProtocol.mjs'

/**
 * Diagram canvases keyed by stable diagram IDs.
 * @type {Map<string, OffscreenCanvas>}
 */
const diagramCanvasMap = new Map()

/**
 * Shared analysis canvas.
 * @type {OffscreenCanvas|null}
 */
let analysisCanvas = null

self.addEventListener('message', (event) => {
    void handleWorkerMessage(event)
})

/**
 * Handles one render worker message.
 * @param {MessageEvent} event
 * @returns {Promise<void>}
 */
async function handleWorkerMessage(event) {
    const message = event?.data
    if (!message || typeof message.type !== 'string') return

    const requestId = Number(message.requestId)
    const payload = message.payload || {}

    try {
        const result = await dispatchRequest(message.type, payload)
        if (Number.isFinite(requestId)) {
            self.postMessage(createWorkerResponse(requestId, result || {}))
        }
    } catch (error) {
        emitRenderEvent(RENDER_OUTBOUND.ERROR, {
            code: typeof error?.code === 'string' ? error.code : 'WORKER_ERROR',
            message: error instanceof Error ? error.message : String(error || 'Render worker error')
        })

        if (Number.isFinite(requestId)) {
            self.postMessage(createWorkerError(requestId, error))
        }
    }
}

/**
 * Routes one render worker command.
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @returns {Promise<Record<string, unknown>>}
 */
async function dispatchRequest(type, payload) {
    if (type === RENDER_INBOUND.ATTACH_DIAGRAM_CANVAS) {
        const diagramId = String(payload.diagramId || '')
        const canvas = payload.canvas
        if (!diagramId || !canvas) {
            throw new Error('attachDiagramCanvas requires diagramId and canvas.')
        }

        diagramCanvasMap.set(diagramId, canvas)
        return { diagramId }
    }

    if (type === RENDER_INBOUND.DRAW_DIAGRAM) {
        const diagramId = String(payload.diagramId || '')
        const canvas = diagramCanvasMap.get(diagramId)
        if (!diagramId || !canvas) {
            throw new Error('drawDiagram requires an attached diagram canvas.')
        }

        drawImpulseDiagram(canvas, normalizeCycle(payload.cycle), {
            ideal: !!payload.ideal
        })

        emitRenderEvent(RENDER_OUTBOUND.RENDERED, {
            target: 'diagram',
            diagramId
        })

        return { diagramId }
    }

    if (type === RENDER_INBOUND.DETACH_DIAGRAM_CANVAS) {
        const diagramId = String(payload.diagramId || '')
        if (diagramId) {
            diagramCanvasMap.delete(diagramId)
        }
        return { diagramId }
    }

    if (type === RENDER_INBOUND.ATTACH_ANALYSIS_CANVAS) {
        if (!payload.canvas) {
            throw new Error('attachAnalysisCanvas requires a canvas.')
        }
        analysisCanvas = payload.canvas
        return { attached: true }
    }

    if (type === RENDER_INBOUND.DRAW_RUNTIME) {
        if (!analysisCanvas) {
            throw new Error('Analysis canvas is not attached.')
        }

        const cycles = normalizeCycles(payload.cycles)
        drawRunTimeScatter(analysisCanvas, cycles)

        emitRenderEvent(RENDER_OUTBOUND.RENDERED, {
            target: 'runtime'
        })

        return { rendered: true }
    }

    if (type === RENDER_INBOUND.GET_SPREAD_ROWS) {
        const spread = computeImpulseSpreadRows(normalizeCycles(payload.cycles))
        emitRenderEvent(RENDER_OUTBOUND.SPREAD_ROWS, {
            spread
        })
        return { spread }
    }

    if (type === RENDER_INBOUND.CLEAR_ANALYSIS) {
        if (analysisCanvas) {
            const ctx = analysisCanvas.getContext('2d')
            ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height)
        }
        return { cleared: true }
    }

    if (type === RENDER_INBOUND.EXPORT_STRIP) {
        const result = await exportStrip(payload)
        emitRenderEvent(RENDER_OUTBOUND.EXPORT_READY, {
            kind: 'strip',
            diagramCount: result.diagramCount,
            mimeType: result.mimeType
        })
        return result
    }

    if (type === RENDER_INBOUND.EXPORT_DIAGRAM) {
        const result = await exportDiagram(payload)
        emitRenderEvent(RENDER_OUTBOUND.EXPORT_READY, {
            kind: 'diagram',
            diagramId: result.diagramId,
            mimeType: result.mimeType
        })
        return result
    }

    if (type === RENDER_INBOUND.SET_LOCALE) {
        setLocale(String(payload.locale || 'en'))
        return { locale: String(payload.locale || 'en') }
    }

    if (type === RENDER_INBOUND.DISPOSE) {
        diagramCanvasMap.clear()
        analysisCanvas = null
        self.close()
        return { disposed: true }
    }

    throw new Error(`Unsupported render worker message: ${type}`)
}

/**
 * Exports all current diagram canvases into one image blob.
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ blob: Blob, mimeType: string, diagramCount: number }>}
 */
async function exportStrip(payload) {
    const diagramIds = Array.isArray(payload.diagramIds) ? payload.diagramIds.map((id) => String(id)) : []
    const canvases = diagramIds.map((id) => diagramCanvasMap.get(id)).filter(Boolean)

    if (!canvases.length) {
        throw new Error('No diagrams available for export.')
    }

    const margin = Math.max(0, Number(payload.margin) || 20)
    const background = String(payload.background || 'white')
    const firstCanvas = canvases[0]

    const width = firstCanvas.width
    const height = firstCanvas.height
    const outWidth = width + margin * 2
    const outHeight = canvases.length * (height + margin) + margin
    const outCanvas = new OffscreenCanvas(outWidth, outHeight)

    const ctx = outCanvas.getContext('2d')
    ctx.fillStyle = background
    ctx.fillRect(0, 0, outWidth, outHeight)

    let y = margin
    for (const canvas of canvases) {
        ctx.drawImage(canvas, margin, y)
        y += height + margin
    }

    const format = String(payload.format || 'png')
    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png'
    const quality = mimeType === 'image/jpeg' ? 0.92 : undefined
    const blob = await outCanvas.convertToBlob({ type: mimeType, quality })

    return {
        blob,
        mimeType,
        diagramCount: canvases.length
    }
}

/**
 * Exports one diagram as an image blob.
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ blob: Blob, mimeType: string, diagramId: string }>}
 */
async function exportDiagram(payload) {
    const diagramId = String(payload.diagramId || '')
    const canvas = diagramCanvasMap.get(diagramId)
    if (!diagramId || !canvas) {
        throw new Error('Diagram not found for export.')
    }

    const format = String(payload.format || 'png')
    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png'
    const quality = mimeType === 'image/jpeg' ? 0.92 : undefined
    const blob = await canvas.convertToBlob({ type: mimeType, quality })

    return {
        blob,
        mimeType,
        diagramId
    }
}

/**
 * Emits one render event to the main thread.
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @returns {void}
 */
function emitRenderEvent(type, payload) {
    self.postMessage({ type, payload })
}

/**
 * Converts one cycle payload to renderer-compatible data.
 * @param {object} cycle
 * @returns {object}
 */
function normalizeCycle(cycle) {
    return {
        ...cycle,
        createdAt: cycle?.createdAt ? new Date(cycle.createdAt) : new Date(),
        nsiTimesMs: Array.isArray(cycle?.nsiTimesMs) ? [...cycle.nsiTimesMs] : [],
        warnings: Array.isArray(cycle?.warnings) ? [...cycle.warnings] : []
    }
}

/**
 * Converts a list of cycles to renderer-compatible data.
 * @param {unknown} cycles
 * @returns {Array<object>}
 */
function normalizeCycles(cycles) {
    if (!Array.isArray(cycles)) return []
    return cycles.map((cycle) => normalizeCycle(cycle))
}
