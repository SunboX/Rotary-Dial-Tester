import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const cssPath = path.join(process.cwd(), 'src', 'style.css')

/**
 * Verifies the body background does not repeat for large pages.
 */
test('style.css disables background repetition on body', () => {
    const css = fs.readFileSync(cssPath, 'utf8')
    assert.ok(css.includes('background-repeat: no-repeat'))
    assert.ok(css.includes('background-size: 100% 100%'))
})

/**
 * Verifies the background fade sizes are configurable and expanded for mobile portrait.
 */
test('style.css defines larger fade sizes for mobile portrait', () => {
    const css = fs.readFileSync(cssPath, 'utf8')
    assert.ok(css.includes('--bg-fade-1'))
    assert.ok(css.includes('--bg-fade-2'))
    assert.ok(css.includes('@media (max-width: 720px) and (orientation: portrait)'))
})
