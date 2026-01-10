import { formatDateTime } from '../utils/format.mjs'
import { t } from '../i18n.mjs'

/**
 * Draws the impulse diagram similar to classic test strip layouts.
 * Coordinates: 1ms = 1px, 0ms starts at x=100.
 * @param {HTMLCanvasElement} canvas
 * @param {object} cycle
 * @param {object} [options]
 * @param {boolean} [options.ideal=false]
 * @returns {void}
 */
export function drawImpulseDiagram(canvas, cycle, { ideal = false } = {}) {
    const ctx = canvas.getContext('2d')
    const W = canvas.width,
        H = canvas.height
    const x0 = 100
    const labelX = 10
    const stateLabelX = 44
    const axisLabelColor = 'rgb(148,162,251)'
    const gridMinor = 'rgb(250,255,255)'
    const gridMajor = 'rgb(148,162,251)'
    const signalLabelColor = 'rgb(0,0,0)'
    const waveformColor = 'rgb(0,0,0)'
    const highlightGreen = 'rgb(46,229,107)'
    // Reserve space under the diagram for axis labels.
    const axisBandHeight = 16
    const diagramBottom = H - axisBandHeight
    const stateGap = 30
    const rowGap = 20
    const nsaRow = { open: diagramBottom, closed: diagramBottom - stateGap }
    const nsrRow = { open: nsaRow.closed - rowGap, closed: nsaRow.closed - rowGap - stateGap }
    const nsiRow = { open: nsrRow.closed - rowGap, closed: nsrRow.closed - rowGap - stateGap }
    const rowMid = {
        nsi: (nsiRow.closed + nsiRow.open) / 2,
        nsr: (nsrRow.closed + nsrRow.open) / 2,
        nsa: (nsaRow.closed + nsaRow.open) / 2
    }
    const axisLabelY = diagramBottom + 12

    // Keep the signal lines clear of the left-side state labels.
    ctx.font = '11px Manrope'
    const stateLabelWidth = Math.max(ctx.measureText(t('diagram.stateClosed')).width, ctx.measureText(t('diagram.stateOpen')).width)
    const lineStartX = Math.min(x0 - 6, Math.max(60, stateLabelX + stateLabelWidth + 8))

    // background
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = 'rgb(177,255,255)'
    ctx.fillRect(0, 0, W, H)

    // grid
    ctx.lineWidth = 1
    for (let x = 0; x <= W; x += 10) {
        ctx.strokeStyle = gridMinor
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, diagramBottom)
        ctx.stroke()
    }
    for (let y = 0; y <= diagramBottom; y += 5) {
        ctx.strokeStyle = gridMinor
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
    }
    for (let x = x0; x <= W; x += 100) {
        ctx.strokeStyle = gridMajor
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, diagramBottom)
        ctx.stroke()
    }

    ctx.strokeStyle = gridMajor
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(W, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, diagramBottom)
    ctx.lineTo(W, diagramBottom)
    ctx.stroke()

    // separators between channels (original layout shows stronger midlines)
    ctx.strokeStyle = gridMajor
    const separators = [(nsiRow.open + nsrRow.closed) / 2, (nsrRow.open + nsaRow.closed) / 2]
    separators.forEach((y) => {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
    })

    // nsi waveform
    const nsiTimes = cycle.nsiTimesMs
    ctx.strokeStyle = waveformColor
    ctx.fillStyle = axisLabelColor
    ctx.font = '11px Manrope'
    ctx.lineWidth = 2

    // assume initial state = 1 (closed) like PB: draw -50..0 as "closed"
    ctx.beginPath()
    ctx.moveTo(lineStartX, nsiRow.closed)
    ctx.lineTo(x0, nsiRow.closed)
    ctx.stroke()

    // draw segments based on toggles, initial=1
    let state = 1
    let prev = 0
    for (let i = 0; i < nsiTimes.length; i++) {
        const cur = nsiTimes[i]
        const y = state ? nsiRow.closed : nsiRow.open
        ctx.beginPath()
        ctx.moveTo(x0 + prev, y)
        ctx.lineTo(x0 + cur, y)
        ctx.stroke()

        // vertical flank
        ctx.beginPath()
        ctx.moveTo(x0 + cur, nsiRow.closed)
        ctx.lineTo(x0 + cur, nsiRow.open)
        ctx.stroke()

        // pulse numbering: label each open segment (state becomes 0)
        if (state === 1) {
            // toggling to 0 now
            const pulseIndex = Math.floor(i / 2) + 1
            // center of open segment will be between this toggle and the next one
            if (i + 1 < nsiTimes.length) {
                const mid = (cur + nsiTimes[i + 1]) / 2
                ctx.fillText(String(pulseIndex), x0 + mid - 4, nsiRow.closed + 17)
            }
        }

        state = state ? 0 : 1
        prev = cur
    }

    // tail to end
    const yTail = state ? nsiRow.closed : nsiRow.open
    ctx.beginPath()
    ctx.moveTo(x0 + prev, yTail)
    ctx.lineTo(W, yTail)
    ctx.stroke()

    // nsa line
    ctx.strokeStyle = waveformColor
    ctx.fillStyle = axisLabelColor
    ctx.font = '12px Manrope'
    if (cycle.hasNsa && typeof cycle.nsaOpenMs === 'number') {
        const xo = x0 + cycle.nsaOpenMs
        // Start from open, then close at nsaOpenMs to match the original diagram timing.
        ctx.beginPath()
        ctx.moveTo(lineStartX, nsaRow.open)
        ctx.lineTo(x0, nsaRow.open)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x0, nsaRow.open)
        ctx.lineTo(xo, nsaRow.open)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(xo, nsaRow.open)
        ctx.lineTo(xo, nsaRow.closed)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(xo, nsaRow.closed)
        ctx.lineTo(W, nsaRow.closed)
        ctx.stroke()
    } else {
        const note = t('diagram.noNsa')
        const noteWidth = ctx.measureText(note).width
        ctx.fillText(note, x0 + Math.max(20, (W - x0 - noteWidth) / 2), rowMid.nsa + 5)
    }

    // nsr line
    if (cycle.hasNsr && typeof cycle.nsrOnMs === 'number') {
        const xr = x0 + cycle.nsrOnMs
        const xa = cycle.hasNsa && typeof cycle.nsaOpenMs === 'number' ? x0 + cycle.nsaOpenMs : W
        ctx.beginPath()
        ctx.moveTo(lineStartX, nsrRow.open)
        ctx.lineTo(x0, nsrRow.open)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x0, nsrRow.open)
        ctx.lineTo(xr, nsrRow.open)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(xr, nsrRow.open)
        ctx.lineTo(xr, nsrRow.closed)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(xr, nsrRow.closed)
        ctx.lineTo(xa, nsrRow.closed)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(xa, nsrRow.closed)
        ctx.lineTo(W, nsrRow.closed)
        ctx.stroke()
    } else {
        const note = t('diagram.noNsr')
        const noteWidth = ctx.measureText(note).width
        ctx.fillText(note, x0 + Math.max(20, (W - x0 - noteWidth) / 2), rowMid.nsr + 5)
    }

    // axis labels (draw after waveforms so text stays readable)
    ctx.fillStyle = axisLabelColor
    ctx.font = '12px Manrope'
    for (let x = x0; x <= 1300; x += 100) {
        const label = String(x - x0)
        const labelWidth = ctx.measureText(label).width
        ctx.fillText(label, x - labelWidth / 2, axisLabelY)
    }
    const msLabel = t('diagram.axisMs')
    const msWidth = ctx.measureText(msLabel).width
    ctx.fillText(msLabel, Math.min(W - msWidth - 8, x0 + 1225), axisLabelY)

    // channel labels
    // Keep digit labels green regardless of the dialed number.
    const digitColor = highlightGreen
    ctx.fillStyle = digitColor
    ctx.font = '12px Manrope'
    ctx.fillText(String(cycle.digit), 6, 12)
    ctx.fillStyle = signalLabelColor
    const priorBaseline = ctx.textBaseline
    // Use middle baseline so the labels are centered between the open/closed lines.
    ctx.textBaseline = 'middle'
    ctx.fillText('nsi', labelX, rowMid.nsi + 4)
    ctx.fillText('nsr', labelX, rowMid.nsr)
    ctx.fillText('nsa', labelX, rowMid.nsa - 4)
    ctx.textBaseline = priorBaseline

    // state labels (draw after waveforms to avoid overlap)
    ctx.fillStyle = axisLabelColor
    ctx.font = '11px Manrope'
    const stateClosed = t('diagram.stateClosed')
    const stateOpen = t('diagram.stateOpen')
    ctx.fillText(stateClosed, stateLabelX, nsiRow.closed + 4)
    ctx.fillText(stateOpen, stateLabelX, nsiRow.open + 4)
    ctx.fillText(stateClosed, stateLabelX, nsrRow.closed + 4)
    ctx.fillText(stateOpen, stateLabelX, nsrRow.open + 4)
    ctx.fillText(stateClosed, stateLabelX, nsaRow.closed + 4)
    ctx.fillText(stateOpen, stateLabelX, nsaRow.open - 4)

    // overlay text
    ctx.fillStyle = axisLabelColor
    if (ideal) {
        const idealNote = t('diagram.idealNote')
        ctx.fillText(idealNote, 150, 20)
        ctx.fillText(idealNote, 150, 80)
        ctx.fillText(idealNote, 150, 130)
    } else {
        const timestamp = formatDateTime(cycle.createdAt)
        // Place the timestamp between the nsa lines so it stays readable.
        const timestampY = rowMid.nsa + 4
        const tsWidth = ctx.measureText(timestamp).width
        ctx.fillStyle = highlightGreen
        ctx.fillText(timestamp, Math.max(x0 + 20, W - tsWidth - 6), timestampY)
        ctx.fillStyle = axisLabelColor
    }

    if (cycle.debounceMs > 0 && !ideal) {
        ctx.fillText(t('diagram.debounceNote'), x0 + 900, 20)
    }
}
