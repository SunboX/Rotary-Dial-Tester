import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const htmlPath = path.join(process.cwd(), 'src', 'index.html')

/**
 * Ensures the imprint card includes the required German public website details.
 * @returns {void}
 */
test('index.html includes imprint details', () => {
    const html = fs.readFileSync(htmlPath, 'utf8')
    // The imprint must list the required identification and contact details.
    assert.ok(html.includes('Imprint'))
    assert.ok(html.includes('André Fiedler'))
    assert.ok(html.includes('Rädelstraße 7'))
    assert.ok(html.includes('08523 Plauen'))
    assert.ok(html.includes('Germany'))
    assert.ok(html.includes('mail@andrefiedler.de'))
})
