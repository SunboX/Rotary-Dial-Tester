import assert from 'node:assert/strict'
import test from 'node:test'
import { buildImpulseSpreadTable } from '../src/js/render/analysis.mjs'

test('buildImpulseSpreadTable returns a table for valid cycles', () => {
    const cycles = [
        { pulses: 3, nsiTimesMs: [0, 50, 100, 150, 200, 250] },
        { pulses: 3, nsiTimesMs: [0, 40, 100, 140, 200, 240] }
    ]

    const html = buildImpulseSpreadTable(cycles)

    assert.ok(html.includes('<table'))
    assert.ok(html.includes('Period'))
    assert.ok(html.includes('<td>1</td>'))
    assert.ok(html.includes('<td>40</td>'))
    assert.ok(html.includes('<td>50</td>'))
    assert.ok(html.includes('strong>10<'))
})

test('buildImpulseSpreadTable reports when pulses are missing', () => {
    const html = buildImpulseSpreadTable([{ pulses: 1, nsiTimesMs: [] }])
    assert.ok(html.includes('Not enough pulses'))
})
