import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const htmlPath = path.join(process.cwd(), 'src', 'index.html')

/**
 * Ensures the footer includes a Mastodon link to the profile.
 * @returns {void}
 */
test('index.html includes Mastodon link', () => {
    const html = fs.readFileSync(htmlPath, 'utf8')
    assert.ok(html.includes('https://mastodon.social/@sonnenkiste'))
})
