import assert from 'node:assert/strict'
import test from 'node:test'
import { drawImpulseDiagram } from '../src/js/render/impulseDiagram.mjs'
import { drawRunTimeScatter } from '../src/js/render/analysis.mjs'
import { formatDateTime } from '../src/js/utils/format.mjs'

/**
 * Creates a mock canvas and 2D context for renderer tests.
 * @param {number} width
 * @param {number} height
 * @returns {{ canvas: object, calls: Record<string, number>, texts: string[], textCalls: Array<{ text: string, x: number, y: number }> }}
 */
function createMockCanvas(width, height) {
    const calls = {}
    const texts = []
    const textCalls = []
    const count = (name) => {
        calls[name] = (calls[name] || 0) + 1
    }

    const ctx = {
        clearRect() { count('clearRect') },
        fillRect() { count('fillRect') },
        beginPath() { count('beginPath') },
        moveTo() { count('moveTo') },
        lineTo() { count('lineTo') },
        stroke() { count('stroke') },
        fillText(text, x = 0, y = 0) {
            count('fillText')
            texts.push(String(text))
            textCalls.push({ text: String(text), x, y })
        },
        arc() { count('arc') },
        fill() { count('fill') },
        save() { count('save') },
        restore() { count('restore') },
        translate() { count('translate') },
        rotate() { count('rotate') },
        measureText(text) {
            return { width: String(text).length * 6 }
        }
    }

    const canvas = {
        width,
        height,
        getContext() {
            return ctx
        }
    }

    return { canvas, calls, texts, textCalls }
}

/**
 * Verifies the impulse diagram renderer draws labels and strokes for a sample cycle.
 * @returns {void}
 */
test('drawImpulseDiagram renders without throwing', () => {
    const { canvas, calls, texts, textCalls } = createMockCanvas(1400, 150)
    const cycle = {
        createdAt: new Date(2024, 0, 1, 0, 0, 0),
        nsiTimesMs: [0, 50, 100, 150],
        pulses: 2,
        digit: 2,
        fHz: 10,
        dutyClosed: 50,
        nsaOpenMs: null,
        nsrOnMs: null,
        prellMs: 0,
        hasNsa: false,
        hasNsr: false
    }

    drawImpulseDiagram(canvas, cycle, { ideal: false })

    assert.ok(calls.fillRect > 0)
    assert.ok(calls.stroke > 0)
    assert.ok(texts.includes('nsi'))
    assert.ok(texts.includes('nsr'))
    assert.ok(texts.includes('nsa'))
    assert.ok(texts.includes('closed'))
    assert.ok(texts.includes('open'))
    assert.ok(texts.includes('ms'))
    const timestamp = formatDateTime(cycle.createdAt)
    const timestampCall = textCalls.find((call) => call.text === timestamp)
    // The timestamp should sit between the nsa lines to avoid overlap.
    assert.ok(timestampCall)
    assert.ok(timestampCall.y > 110)
    assert.ok(timestampCall.y < 125)
    const axisBandHeight = 16
    const diagramBottom = canvas.height - axisBandHeight
    const stateGap = 30
    const rowGap = 20
    const nsaOpen = diagramBottom
    const nsaClosed = nsaOpen - stateGap
    const nsrOpen = nsaClosed - rowGap
    const nsrClosed = nsrOpen - stateGap
    const nsiOpen = nsrClosed - rowGap
    const nsiClosed = nsiOpen - stateGap
    const rowMid = {
        nsi: (nsiClosed + nsiOpen) / 2,
        nsr: (nsrClosed + nsrOpen) / 2,
        nsa: (nsaClosed + nsaOpen) / 2
    }
    const nsiCall = textCalls.find((call) => call.text === 'nsi')
    const nsrCall = textCalls.find((call) => call.text === 'nsr')
    const nsaCall = textCalls.find((call) => call.text === 'nsa')
    // Channel labels should be centered between their open/closed lines.
    assert.equal(nsiCall?.y, rowMid.nsi + 4)
    assert.equal(nsrCall?.y, rowMid.nsr)
    assert.equal(nsaCall?.y, rowMid.nsa - 4)
    const openLabels = textCalls.filter((call) => call.text === 'open')
    const maxOpenLabelY = Math.max(...openLabels.map((call) => call.y))
    // The lowest open label should stay above the bottom blue line.
    assert.ok(maxOpenLabelY < diagramBottom)
})

/**
 * Confirms the runtime scatter renderer draws expected primitives for a minimal dataset.
 * @returns {void}
 */
test('drawRunTimeScatter renders without throwing', () => {
    const { canvas, calls } = createMockCanvas(1100, 190)
    const cycles = [
        { nsiTimesMs: [0, 50, 100, 150], hasNsa: false },
        { nsiTimesMs: [0, 55, 110, 165], hasNsa: false }
    ]

    drawRunTimeScatter(canvas, cycles)

    assert.ok(calls.fillRect > 0)
    assert.ok(calls.stroke > 0)
    assert.ok(calls.arc > 0)
})
