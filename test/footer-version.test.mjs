import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const htmlPath = path.join(process.cwd(), 'src', 'index.html')
const packageJsonPath = path.join(process.cwd(), 'package.json')

/**
 * Ensures the footer version label matches package.json.
 * @returns {void}
 */
test('index.html footer version matches package.json', () => {
    const html = fs.readFileSync(htmlPath, 'utf8')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

    // Keep the visible footer version in sync with the release version.
    assert.ok(html.includes(`id="appVersion">${packageJson.version}</span>`))
})
