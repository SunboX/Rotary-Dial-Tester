import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const cssPath = path.join(process.cwd(), 'src', 'style.css')

/**
 * Ensures the DTMF checkbox block is offset to align with the debounce select.
 * @returns {void}
 */
test('style.css offsets the check control for vertical centering', () => {
    const css = readFileSync(cssPath, 'utf8')

    assert.match(css, /\.check\s*\{[^}]*margin-top:\s*20px;/s)
})

/**
 * Ensures the analysis buttons span the full row width.
 * @returns {void}
 */
test('style.css stretches analysis buttons to full width', () => {
    const css = readFileSync(cssPath, 'utf8')

    assert.match(css, /\.analysis-row\s*\{[^}]*flex-direction:\s*column;/s)
    assert.match(css, /\.analysis-row\s*\.btn\s*\{[^}]*width:\s*100%;/s)
})
