import { clamp } from '../utils/format.mjs'

/**
 * Analysis like Runtime10 (spread of runs).
 * Draws points for 10 measurements and min/max lines.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<object>} cycles
 * @returns {void}
 */
export function drawRunTimeScatter(canvas, cycles) {
    const ctx = canvas.getContext('2d')
    const W = canvas.width,
        H = canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = 'rgb(177,255,255)'
    ctx.fillRect(0, 0, W, H)

    // grid
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
        ctx.fillText('Run ' + i, 100 * i - 25, 182)
    }
    ctx.save()
    ctx.translate(22, 140)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('Grid = 10/100ms', 0, 0)
    ctx.restore()

    // compute runtimes: like PB uses nsa open if available else last close (last timestamp)
    const runtimes = cycles.slice(0, 10).map((c) => {
        if (c.hasNsa && typeof c.nsaOpenMs === 'number') return c.nsaOpenMs
        const t = c.nsiTimesMs
        return t.length ? t[t.length - 1] : 0
    })

    const ref = runtimes[0] || 0
    const ys = runtimes.map((rt) => 75 + (rt - ref))

    let min = Infinity,
        max = -Infinity
    ys.forEach((y) => {
        min = Math.min(min, y)
        max = Math.max(max, y)
    })

    // points
    for (let i = 0; i < 10; i++) {
        const x = 100 + 100 * i
        const y = clamp(ys[i], 10, 155)
        ctx.fillStyle = 'rgb(255,0,0)'
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fill()
    }

    // min/max lines
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
    const note = cycles[0]?.hasNsa ? '(measured from first nsi open to nsa open again)' : '(measured from first nsi open to last nsi closed)'
    ctx.fillText(note, 500, 14)

    ctx.fillStyle = 'rgb(255,0,0)'
    ctx.fillText(`timing spread of runs: ${Math.round(max - min)}ms`, 862, 14)
}

/**
 * Builds a table for pulse/pause spread (10x).
 * Returns HTML string.
 * @param {Array<object>} cycles
 * @returns {string}
 */
export function buildImpulseSpreadTable(cycles) {
    const c10 = cycles.slice(0, 10)
    const pulses = c10[0]?.pulses ?? 0
    if (!pulses || pulses < 2) return "<p class='muted'>Not enough pulses for spread analysis.</p>"

    // Periodic analysis like PB (without the first off phase):
    // open(off) durations: (t[3]-t[2]), (t[5]-t[4]) ...
    // closed(on) durations: (t[2]-t[1]), (t[4]-t[3]) ...
    const rows = []
    const periods = pulses - 1
    for (let k = 0; k < periods; k++) {
        const openDur = []
        const closedDur = []
        for (const c of c10) {
            const t = c.nsiTimesMs
            const iOpenStart = 2 + 2 * k // 2,4,6...
            const iOpenEnd = iOpenStart + 1
            const iClosedStart = iOpenStart - 1 // 1,3,5...
            if (iOpenEnd < t.length && iClosedStart >= 0) {
                openDur.push(t[iOpenEnd] - t[iOpenStart])
                closedDur.push(t[iOpenStart] - t[iClosedStart])
            }
        }
        if (!openDur.length) continue
        const oMin = Math.min(...openDur),
            oMax = Math.max(...openDur)
        const cMin = Math.min(...closedDur),
            cMax = Math.max(...closedDur)
        rows.push({
            period: k + 1,
            oMin,
            oMax,
            oDiff: oMax - oMin,
            cMin,
            cMax,
            cDiff: cMax - cMin
        })
    }

    const head = `
<table class="table">
  <thead>
    <tr>
      <th>Period</th>
      <th>nsi open (pulse) min</th>
      <th>nsi open max</th>
      <th>Delta</th>
      <th>nsi closed (pause) min</th>
      <th>nsi closed max</th>
      <th>Delta</th>
    </tr>
  </thead>
  <tbody>
`
    const body = rows
        .map(
            (r) => `
    <tr>
      <td>${r.period}</td>
      <td>${r.oMin}</td>
      <td>${r.oMax}</td>
      <td><strong>${r.oDiff}</strong></td>
      <td>${r.cMin}</td>
      <td>${r.cMax}</td>
      <td><strong>${r.cDiff}</strong></td>
    </tr>
  `
        )
        .join('')
    const foot = `
  </tbody>
</table>
<p class="muted" style="margin-top:10px">Note: matches the original logic (first pulse off phase is not used for period calculation).</p>
`
    return head + body + foot
}
