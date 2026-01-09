import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const cssPath = path.join(process.cwd(), 'src', 'style.css')

/**
 * Verifies the mobile header layout styles exist for narrow viewports.
 */
test('style.css includes mobile header layout rules', () => {
    const css = fs.readFileSync(cssPath, 'utf8')
    assert.ok(css.includes('@media (max-width: 720px)'))
    assert.ok(css.includes('.app-header'))
    assert.ok(css.includes('.header-actions'))
    assert.ok(css.includes('grid-template-columns: repeat(2'))
})

/**
 * Verifies the mobile port label stretches to match button widths.
 */
test('style.css makes the port label full-width on mobile', () => {
    const css = fs.readFileSync(cssPath, 'utf8')
    assert.ok(css.includes('.header-actions .port-pill'))
    assert.ok(css.includes('max-width: none'))
    assert.ok(css.includes('width: 100%'))
})
