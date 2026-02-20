import { clamp } from '../utils/format.mjs'
import { t } from '../i18n.mjs'

/**
 * Analysis like Runtime10 (spread of runs).
 * Draws points for 10 measurements and min/max lines.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {Array<object>} cycles
 * @returns {void}
 */
export function drawRunTimeScatter(canvas, cycles) {
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = 'rgb(177,255,255)'
    ctx.fillRect(0, 0, W, H)

    // Draw fine and major grid lines before plotting points.
    for (let x = 0; x <= W; x += 10) {
        ctx.strokeStyle = 'rgb(250,255,255)'
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
    }
    for (let y = 0; y <= H; y += 5) {
        ctx.strokeStyle = 'rgb(250,255,255)'
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
    }
    for (let x = 50; x <= W; x += 100) {
        ctx.strokeStyle = 'rgb(148,162,251)'
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
    }

    ctx.strokeStyle = 'rgb(148,162,251)'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(W, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, H - 1)
    ctx.lineTo(W, H - 1)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 50)
    ctx.lineTo(W, 50)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 100)
    ctx.lineTo(W, 100)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 150)
    ctx.lineTo(W, 150)
    ctx.stroke()

    ctx.strokeStyle = 'rgb(0,0,0)'
    ctx.beginPath()
    ctx.moveTo(30, 165)
    ctx.lineTo(W - 10, 165)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(50, 10)
    ctx.lineTo(50, 180)
    ctx.stroke()

    ctx.fillStyle = 'rgb(0,0,0)'
    ctx.font = '12px Manrope'
    for (let i = 1; i <= 10; i++) {
        ctx.fillText(t('analysis.runtimeRun', { count: i }), 100 * i - 25, 182)
    }
    ctx.save()
    ctx.translate(22, 140)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(t('analysis.runtimeGrid'), 0, 0)
    ctx.restore()

    // Use nsa-open runtime if available, otherwise fallback to final nsi timestamp.
    const runtimes = cycles.slice(0, 10).map((cycle) => {
        if (cycle.hasNsa && typeof cycle.nsaOpenMs === 'number') return cycle.nsaOpenMs
        const nsiTimes = cycle.nsiTimesMs
        return nsiTimes.length ? nsiTimes[nsiTimes.length - 1] : 0
    })

    const ref = runtimes[0] || 0
    const ys = runtimes.map((runtime) => 75 + (runtime - ref))

    let min = Infinity
    let max = -Infinity
    ys.forEach((value) => {
        min = Math.min(min, value)
        max = Math.max(max, value)
    })

    for (let i = 0; i < 10; i++) {
        const x = 100 + 100 * i
        const y = clamp(ys[i], 10, 155)
        ctx.fillStyle = 'rgb(255,0,0)'
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fill()
    }

    ctx.fillStyle = 'rgb(255,0,0)'
    ctx.strokeStyle = 'rgb(255,0,0)'
    ctx.beginPath()
    ctx.moveTo(50, min)
    ctx.lineTo(W - 30, min)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(50, max)
    ctx.lineTo(W - 30, max)
    ctx.stroke()

    ctx.fillStyle = 'rgb(0,0,255)'
    ctx.font = '13px Manrope'
    const note = cycles[0]?.hasNsa ? t('analysis.runtimeNoteNsa') : t('analysis.runtimeNoteNsi')
    ctx.fillText(note, 500, 14)

    ctx.fillStyle = 'rgb(255,0,0)'
    ctx.fillText(t('analysis.runtimeSpread', { value: Math.round(max - min) }), 862, 14)
}

/**
 * Computes spread-analysis rows from captured cycles.
 * @param {Array<object>} cycles
 * @returns {{ pulses: number, rows: Array<object> }}
 */
export function computeImpulseSpreadRows(cycles) {
    const firstTenCycles = cycles.slice(0, 10)
    const pulses = firstTenCycles[0]?.pulses ?? 0
    if (!pulses || pulses < 2) {
        return {
            pulses,
            rows: []
        }
    }

    const rows = []
    const periods = pulses - 1

    for (let periodIndex = 0; periodIndex < periods; periodIndex++) {
        const openDurations = []
        const closedDurations = []

        for (const cycle of firstTenCycles) {
            const nsiTimes = cycle.nsiTimesMs
            const openStartIndex = 2 + 2 * periodIndex
            const openEndIndex = openStartIndex + 1
            const closedStartIndex = openStartIndex - 1

            if (openEndIndex < nsiTimes.length && closedStartIndex >= 0) {
                openDurations.push(nsiTimes[openEndIndex] - nsiTimes[openStartIndex])
                closedDurations.push(nsiTimes[openStartIndex] - nsiTimes[closedStartIndex])
            }
        }

        if (!openDurations.length) continue

        const openMin = Math.min(...openDurations)
        const openMax = Math.max(...openDurations)
        const closedMin = Math.min(...closedDurations)
        const closedMax = Math.max(...closedDurations)

        rows.push({
            period: periodIndex + 1,
            oMin: openMin,
            oMax: openMax,
            oDiff: openMax - openMin,
            cMin: closedMin,
            cMax: closedMax,
            cDiff: closedMax - closedMin
        })
    }

    return {
        pulses,
        rows
    }
}

/**
 * Builds spread-analysis HTML from precomputed row data.
 * @param {{ pulses: number, rows: Array<object> }} spreadData
 * @returns {string}
 */
export function buildImpulseSpreadTableFromRows(spreadData) {
    if (!spreadData?.pulses || spreadData.pulses < 2) {
        return `<p class='muted'>${t('analysis.spreadNotEnough')}</p>`
    }

    const rows = Array.isArray(spreadData.rows) ? spreadData.rows : []
    if (!rows.length) {
        return `<p class='muted'>${t('analysis.spreadNotEnough')}</p>`
    }

    const head = `
<table class="table">
  <thead>
    <tr>
      <th>${t('analysis.spreadPeriod')}</th>
      <th>${t('analysis.spreadOpenMin')}</th>
      <th>${t('analysis.spreadOpenMax')}</th>
      <th>${t('analysis.spreadDelta')}</th>
      <th>${t('analysis.spreadClosedMin')}</th>
      <th>${t('analysis.spreadClosedMax')}</th>
      <th>${t('analysis.spreadDelta')}</th>
    </tr>
  </thead>
  <tbody>
`

    const body = rows
        .map(
            (row) => `
    <tr>
      <td>${row.period}</td>
      <td>${row.oMin}</td>
      <td>${row.oMax}</td>
      <td><strong>${row.oDiff}</strong></td>
      <td>${row.cMin}</td>
      <td>${row.cMax}</td>
      <td><strong>${row.cDiff}</strong></td>
    </tr>
`
        )
        .join('')

    const foot = `
  </tbody>
</table>
<p class="muted" style="margin-top:10px">${t('analysis.spreadNote')}</p>
`

    return head + body + foot
}

/**
 * Builds a spread-analysis table directly from cycles.
 * @param {Array<object>} cycles
 * @returns {string}
 */
export function buildImpulseSpreadTable(cycles) {
    const spreadData = computeImpulseSpreadRows(cycles)
    return buildImpulseSpreadTableFromRows(spreadData)
}
