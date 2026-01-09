import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const htmlPath = path.join(process.cwd(), 'src', 'index.html')

/**
 * Verifies the analysis button explanation text is present in the UI.
 */
test('index.html includes analysis button explanation text', () => {
    const html = fs.readFileSync(htmlPath, 'utf8')
    assert.ok(html.includes('Note: Unlocks after 10 diagrams with the same digit.'))
    assert.ok(html.includes('Runtime shows timing spread across 10 cycles'))
    assert.ok(html.includes('pulse/pause lists min/max and delta per period'))
})
