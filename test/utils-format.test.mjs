import assert from 'node:assert/strict'
import test from 'node:test'
import { pad2, formatDateTime, clamp } from '../src/js/utils/format.mjs'

test('pad2 pads to two digits', () => {
    assert.equal(pad2(0), '00')
    assert.equal(pad2(5), '05')
    assert.equal(pad2(12), '12')
})

test('formatDateTime formats a date consistently', () => {
    const date = new Date(2024, 0, 2, 3, 4, 5)
    assert.equal(formatDateTime(date), '02.01.2024  03:04:05')
})

test('clamp clamps values to a range', () => {
    assert.equal(clamp(5, 0, 10), 5)
    assert.equal(clamp(-5, 0, 10), 0)
    assert.equal(clamp(15, 0, 10), 10)
})
