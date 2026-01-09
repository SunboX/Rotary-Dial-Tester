import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const cssPath = path.join(process.cwd(), 'src', 'style.css')

/**
 * Ensures the diagram canvas stretches to full width without fixed sizing.
 * @returns {void}
 */
test('style.css stretches diagram canvas to full width', () => {
    const css = readFileSync(cssPath, 'utf8')

    assert.match(css, /\.diagram-canvas\s*\{[^}]*width:\s*100%/s)
    assert.match(css, /\.diagram-canvas\s*\{[^}]*height:\s*auto/si)
    assert.doesNotMatch(css, /@media\s*\(max-width:\s*980px\)[\s\S]*\.diagram-canvas\s*\{[^}]*width:\s*\d+px/i)
})
