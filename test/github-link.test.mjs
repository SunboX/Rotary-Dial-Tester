import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const htmlPath = path.join(process.cwd(), 'src', 'index.html')

/**
 * Ensures the header includes a GitHub link to the project repository.
 * @returns {void}
 */
test('index.html includes GitHub repository link', () => {
    const html = fs.readFileSync(htmlPath, 'utf8')
    // The header should provide a visible link to the GitHub repository.
    assert.ok(html.includes('https://github.com/SunboX/Rotary-Dial-Tester'))
    assert.ok(html.includes('aria-label="GitHub repository"'))
})
