import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const htmlPath = path.join(process.cwd(), 'src', 'index.html')

/**
 * Ensures the help dialog includes the translated rotary dial summary content.
 * @returns {void}
 */
test('index.html includes rotary dial summary in help dialog', () => {
    const html = readFileSync(htmlPath, 'utf8')

    assert.match(html, /Rotary dial testing and adjustment/i)
    assert.match(html, /10 pulses per second/i)
    assert.match(html, /nsi/i)
    assert.match(html, /nsa/i)
    assert.match(html, /nsr/i)
})
